const express     = require('express')
const { getDb }   = require('../db/setup')
const REQ_DATA    = require('../data/requirements.json')       // legacy: miamiPlan categories only
const MAJOR_REQ   = require('../data/majorRequirements.json')  // v3: per-major real bulletin data
const MINOR_REQ   = require('../data/minorRequirements.json')  // v1: per-minor data
const {
  getMajorTrack,
  getTrackExclusions,
  getEquivalencyBlocks,
  getTrackScoreAdjustment,
  getTrackReason,
} = require('../data/majorCurriculum')

const router = express.Router()

// ── Fuzzy major lookup (same logic as requirementGap.js) ──────────────────────
function findMajorData(major) {
  if (!major) return null
  if (MAJOR_REQ[major]) return MAJOR_REQ[major]
  const lower = major.toLowerCase().trim()
  for (const [key, val] of Object.entries(MAJOR_REQ)) {
    if (key.toLowerCase() === lower) return val
  }
  for (const [key, val] of Object.entries(MAJOR_REQ)) {
    const kl = key.toLowerCase()
    if (kl.startsWith(lower) || lower.startsWith(kl)) return val
  }
  const inputWords = lower.split(/\s+/).filter(w => w.length > 3)
  let best = null, bestScore = 0
  for (const [key, val] of Object.entries(MAJOR_REQ)) {
    const kw = key.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    const overlap = inputWords.filter(w => kw.some(k => k.includes(w) || w.includes(k))).length
    const score   = overlap / Math.max(inputWords.length, kw.length, 1)
    if (score > 0.6 && score > bestScore) { bestScore = score; best = val }
  }
  return best
}

// ── Fuzzy minor lookup ────────────────────────────────────────────────────────
function findMinorData(minor) {
  if (!minor) return null
  if (MINOR_REQ[minor]) return MINOR_REQ[minor]
  const lower = minor.toLowerCase().trim()
  for (const [key, val] of Object.entries(MINOR_REQ)) {
    if (key.toLowerCase() === lower) return val
  }
  for (const [key, val] of Object.entries(MINOR_REQ)) {
    const kl = key.toLowerCase()
    if (kl.startsWith(lower) || lower.startsWith(kl)) return val
  }
  return null
}

/**
 * POST /api/recommend
 * Body: { major, minor, completedCourses: [], preferences: { year, credits, timePrefs, avoidDays, workload, interests } }
 * Returns: ranked course list with fit scores and reasoning
 */
router.post('/', (req, res) => {
  try {
    const { major = '', minor = '', completedCourses = [], preferences = {} } = req.body
    const completed = completedCourses.map(c => c.toUpperCase())

    // ── Curriculum intelligence: track + exclusions ────────────────────────────
    const track           = getMajorTrack(major)
    const trackExclusions = getTrackExclusions(track)
    const equivBlocks     = getEquivalencyBlocks(completed, track)
    // Combined set of codes we should never show this student
    const hardExclude     = new Set([...trackExclusions, ...equivBlocks])

    const db = getDb()

    // Fetch sections with course info — Oxford campus, current term
    // Excludes: completed courses + hard-excluded wrong-track/equivalent courses
    const allExcluded = [...completed, ...hardExclude]
    const sections = db.prepare(`
      SELECT
        c.id, c.code, c.subject, c.number, c.name, c.credits,
        c.department, c.description, c.level,
        s.crn, s.section, s.instructor, s.rmp_score,
        s.days, s.start_time, s.end_time, s.schedule, s.room,
        s.seats_total, s.seats_avail, s.waitlist,
        s.term, s.term_label, s.delivery
      FROM sections s
      JOIN courses c ON c.code = s.code
      WHERE s.campus = 'Oxford'
        AND s.term = (SELECT MAX(term) FROM sections)
        AND c.code NOT IN (${allExcluded.length ? allExcluded.map(() => '?').join(',') : "''"})
      ORDER BY s.seats_avail DESC
    `).all(...(allExcluded.length ? allExcluded : []))

    db.close()

    // Resolve major and minor data (fuzzy match)
    const majorData = findMajorData(major)
    const minorData = findMinorData(minor)

    // Build fast-lookup sets for major/minor required + elective codes
    const majorCoreCodes     = new Set((majorData?.coreCourses     || []).map(c => c.code))
    const majorElectiveCodes = new Set((majorData?.electiveGroups  || []).flatMap(g => g.courses))
    const minorRequiredCodes = new Set((minorData?.requiredCourses  || []).map(c => c.code))
    const minorElectiveCodes = new Set((minorData?.electiveCourses  || []))

    // Score each section
    const scored = sections.map(s => {
      let score = 50
      const reasons = []

      // ── Major requirement alignment (using new majorRequirements.json) ──
      let reqType = null

      if (majorData) {
        if (majorCoreCodes.has(s.code)) {
          score += 35
          reqType = 'Major Core'
          reasons.push(`Required for ${major} — core course`)
        } else if (majorElectiveCodes.has(s.code)) {
          // Find which group it belongs to
          const group = majorData.electiveGroups.find(g => g.courses.includes(s.code))
          score += 18
          reqType = 'Major Elective'
          reasons.push(`Counts toward ${major}: ${group?.name || 'elective requirement'}`)
        }

        // Sequence bonus — recommended for their year/semester
        const yearOrder = majorData.suggestedOrder?.[preferences.year] || []
        if (yearOrder.includes(s.code)) {
          score += 15
          reasons.push(`Suggested for ${preferences.year || 'your year'} in ${major}`)
        }
      }

      // ── Minor requirement alignment ──
      if (minorData && minor) {
        if (minorRequiredCodes.has(s.code)) {
          score += 25
          reqType = reqType || 'Minor Required'
          reasons.push(`Required for ${minor} minor`)
        } else if (minorElectiveCodes.has(s.code)) {
          score += 12
          reqType = reqType || 'Minor Elective'
          reasons.push(`Counts toward ${minor} minor`)
        }
      }

      // ── Miami Plan alignment (using legacy miamiPlan data) ──
      for (const cat of REQ_DATA.miamiPlan.categories) {
        if (cat.courses.includes(s.code) && !completed.some(c => cat.courses.includes(c))) {
          score += 12
          reqType = reqType || cat.label
          reasons.push(`Satisfies Miami Plan: ${cat.label}`)
        }
      }

      // ── RMP score ──
      if (s.rmp_score >= 4.5) { score += 10; reasons.push(`Top-rated professor (${s.rmp_score} RMP)`) }
      else if (s.rmp_score >= 4.0) { score += 5 }
      else if (s.rmp_score < 3.5) { score -= 8 }

      // ── Seat availability urgency ──
      const seatPct = s.seats_avail / (s.seats_total || 1)
      if (seatPct < 0.15 && s.seats_avail > 0) { score += 5; reasons.push('Few seats left — worth grabbing') }
      if (s.seats_avail === 0) score -= 5

      // ── Schedule preferences ──
      if (preferences.avoidDays?.length) {
        const avoiding = preferences.avoidDays.some(d => s.days?.includes(d))
        if (avoiding) score -= 15
      }
      if (preferences.timePrefs?.includes('morning') && s.start_time < '12:00') { score += 5 }
      if (preferences.timePrefs?.includes('afternoon') && s.start_time >= '12:00' && s.start_time < '17:00') { score += 5 }
      if (preferences.timePrefs?.includes('evening') && s.start_time >= '17:00') { score += 5 }

      // ── Credits target ──
      const target = parseInt(preferences.credits) || 15
      if (s.credits && s.credits <= target) score += 3

      // ── Course level alignment with student year ──
      const yearMap = { Freshman: 'intro', Sophomore: 'mid', Junior: 'upper', Senior: 'upper' }
      const expectedLevel = yearMap[preferences.year]
      if (expectedLevel && s.level === expectedLevel) score += 8

      // ── Interest matching ──
      if (preferences.interests?.length) {
        const interestMap = {
          'AI & ML':         ['CSE 432', 'CSE 433', 'CSE 486', 'STA 301', 'MTH 231'],
          'Data Science':    ['STA 261', 'STA 301', 'ISA 225', 'CSE 385', 'MTH 222'],
          'Entrepreneurship':['ESP 101', 'ESP 201', 'MGT 291', 'MKT 291', 'FIN 301'],
          'Research':        ['PSY 241', 'STA 261', 'BIO 305', 'CHM 241'],
          'Healthcare':      ['BIO 115', 'CHM 141', 'PSY 111', 'KNH 251', 'NSG 201'],
        }
        for (const interest of preferences.interests) {
          if (interestMap[interest]?.includes(s.code)) {
            score += 10
            reasons.push(`Matches your interest in ${interest}`)
          }
        }
      }

      // ── Track-aware scoring (curriculum intelligence) ──────────────────────
      // Rewards courses that are RIGHT for this student's academic track and
      // penalizes any that slipped past the hard-exclusion filter above.
      const trackAdj = getTrackScoreAdjustment(s.code, track)
      if (trackAdj !== 0) {
        score += trackAdj
        const trackReason = getTrackReason(s.code, track)
        if (trackReason && trackAdj > 0) reasons.push(trackReason)
      }

      return {
        ...s,
        fitScore:     Math.min(100, Math.max(0, Math.round(score))),
        requirementType: reqType || 'Elective',
        reasons:      reasons.length ? reasons : ['Good match based on your profile'],
        track,
      }
    })

    // Deduplicate by code — keep highest-scoring section per course
    const byCode = {}
    for (const s of scored) {
      if (!byCode[s.code] || s.fitScore > byCode[s.code].fitScore) byCode[s.code] = s
    }

    // ── Diversity pass ────────────────────────────────────────────────────────
    // Pure score-sort leads to all major-core courses crowding out Miami Plan
    // and electives. Instead, allocate slots by requirement category first,
    // then fill the rest with highest scorers.
    const pool = Object.values(byCode).sort((a, b) => b.fitScore - a.fitScore)

    const buckets = {
      'Major Core':     pool.filter(c => c.requirementType === 'Major Core'),
      'Miami Plan':     pool.filter(c => c.requirementType !== 'Major Core'
                                      && c.requirementType !== 'Major Elective'
                                      && c.requirementType !== 'Minor Required'
                                      && c.requirementType !== 'Minor Elective'
                                      && c.requirementType !== 'Elective'),
      'Minor Required': pool.filter(c => c.requirementType === 'Minor Required'),
      'Major Elective': pool.filter(c => c.requirementType === 'Major Elective'),
      'Minor Elective': pool.filter(c => c.requirementType === 'Minor Elective'),
      'Elective':       pool.filter(c => c.requirementType === 'Elective'),
    }

    // Allocation caps per bucket (adjust to always sum ≤ 20 so we have room)
    const caps = {
      'Major Core':     5,
      'Miami Plan':     4,
      'Minor Required': 3,
      'Major Elective': 3,
      'Minor Elective': 2,
      'Elective':       3,
    }

    const selected = []
    const usedCodes = new Set()

    for (const [bucket, cap] of Object.entries(caps)) {
      let count = 0
      for (const c of buckets[bucket]) {
        if (count >= cap) break
        if (!usedCodes.has(c.code)) {
          selected.push(c)
          usedCodes.add(c.code)
          count++
        }
      }
    }

    // Fill remaining slots to 20 with highest overall scorers not yet included
    for (const c of pool) {
      if (selected.length >= 20) break
      if (!usedCodes.has(c.code)) {
        selected.push(c)
        usedCodes.add(c.code)
      }
    }

    const ranked = selected
      .sort((a, b) => b.fitScore - a.fitScore)
      .slice(0, 20)
      .map((c, i) => ({ ...c, rank: i + 1 }))

    res.json({
      results: ranked,
      meta: {
        major,
        majorFound:     !!majorData,
        minor:          minor || null,
        minorFound:     !!minorData,
        completedCount: completed.length,
        track,
        excludedCount:  hardExclude.size,
        term:           ranked[0]?.term_label || 'Current Term',
        generatedAt:    new Date().toISOString(),
      }
    })
  } catch (err) {
    console.error('/api/recommend error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
