/**
 * AI Schedule Builder
 *
 * POST /api/schedule/build
 *
 * Calls Claude with the student's full profile + their top course candidates
 * and asks it to select a coherent, conflict-free semester schedule that:
 *  - Fills GE (Miami Plan) requirements
 *  - Advances their major/minor
 *  - Matches their credit target and time preferences
 *  - Does NOT pick redundant or wrong-track courses
 *
 * Returns: { schedule: [...sections], reasoning: string, warnings: [] }
 */

const express = require('express')
const router  = express.Router()
const { getDb } = require('../db/setup')
const MAJOR_REQ = require('../data/majorRequirements.json')
const MINOR_REQ = require('../data/minorRequirements.json')
const {
  getMajorTrack,
  getTrackExclusions,
  getEquivalencyBlocks,
} = require('../data/majorCurriculum')

// ── Fuzzy lookups (same as recommend.js) ─────────────────────────────────────

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
  return null
}

function findMinorData(minor) {
  if (!minor) return null
  if (MINOR_REQ[minor]) return MINOR_REQ[minor]
  const lower = minor.toLowerCase().trim()
  for (const [key, val] of Object.entries(MINOR_REQ)) {
    if (key.toLowerCase() === lower) return val
  }
  return null
}

// ── System prompt builder ─────────────────────────────────────────────────────

function buildSchedulePrompt(profile, candidates, majorData, minorData) {
  const {
    major = 'Undecided',
    minor = null,
    year  = 'Sophomore',
    completedCourses = [],
    credits = 15,
    timePrefs = [],
    workload  = 'moderate',
    avoidDays = [],
  } = profile

  const track = getMajorTrack(major)

  const coreCodes    = (majorData?.coreCourses    || []).map(c => c.code)
  const electiveCodes = (majorData?.electiveGroups || []).flatMap(g => g.courses)
  const minorCodes   = (minorData?.requiredCourses || []).map(c => c.code)

  // Format candidate courses for Claude
  const candidateList = candidates.slice(0, 40).map(c => {
    const isCore     = coreCodes.includes(c.code)
    const isElective = electiveCodes.includes(c.code)
    const isMinor    = minorCodes.includes(c.code)
    const priority   = isCore ? 'MAJOR CORE' : isMinor ? 'MINOR REQUIRED' : isElective ? 'MAJOR ELECTIVE' : c.requirementType || 'GE/ELECTIVE'
    return `${c.code} | ${c.name} | ${c.credits}cr | ${c.schedule || 'TBA'} | ${priority} | RMP:${c.rmp_score || 'N/A'} | Seats:${c.seats_avail}`
  }).join('\n')

  const timeGuide = timePrefs.length
    ? `Preferred times: ${timePrefs.join(', ')}`
    : 'No strong time preference'

  return `You are an expert academic advisor at Miami University (Oxford, Ohio).
Your job is to build the BEST possible next-semester schedule for this student.

## Student Profile
- Major: ${major} (Academic track: ${track})
- Minor: ${minor || 'none'}
- Year: ${year}
- Completed courses: ${completedCourses.join(', ') || 'none listed'}
- Credit target: ${credits} credit hours
- Workload preference: ${workload}
- ${timeGuide}
- Avoid days: ${avoidDays.join(', ') || 'none'}

## Major Requirements Context
- Core courses still needed: ${coreCodes.filter(c => !completedCourses.includes(c)).join(', ') || 'all complete'}
- Minor courses still needed: ${minorCodes.filter(c => !completedCourses.includes(c)).join(', ') || 'n/a'}

## Available Courses (format: CODE | Name | Credits | Schedule | Priority | RMP | Seats)
${candidateList}

## Your Task
Select 4-6 courses from the list above that form the BEST schedule for this student.

Rules you MUST follow:
1. Total credits should be ${credits - 2}–${credits + 1} (target: ${credits})
2. No time conflicts — if two courses meet on the same days at overlapping times, pick only one
3. Prioritize MAJOR CORE courses first, then MINOR REQUIRED, then GE/ELECTIVE to fill Miami Plan gaps
4. For ${track === 'BUSINESS' ? 'business' : track === 'STEM_CS' ? 'CS' : track === 'STEM_SCI' ? 'science/health' : 'this'} students, pick courses that are appropriate for their academic path — do not suggest courses from the wrong track
5. Balance workload — don't stack all challenging courses in one semester
6. Prefer sections with available seats (Seats > 0)
7. Favor higher RMP scores when multiple sections of the same course exist
8. If the student has a time preference, honor it where possible

Respond with ONLY a JSON object in this exact format (no markdown, no explanation outside the JSON):
{
  "selectedCodes": ["CODE1", "CODE2", "CODE3", "CODE4"],
  "totalCredits": 15,
  "reasoning": "2-3 sentence explanation of why this is a good schedule for this student",
  "warnings": ["any schedule concern, e.g. 'STA 261 is nearly full — register early'"]
}`
}

// ── POST /api/schedule/build ──────────────────────────────────────────────────

router.post('/build', async (req, res) => {
  try {
    const {
      major = '',
      minor = '',
      completedCourses = [],
      preferences = {},
    } = req.body

    const completed = completedCourses.map(c => c.toUpperCase())
    const track     = getMajorTrack(major)
    const excluded  = new Set([
      ...getTrackExclusions(track),
      ...getEquivalencyBlocks(completed, track),
      ...completed,
    ])

    // ── Fetch candidate courses from DB ──────────────────────────────────────
    let candidates = []
    try {
      const db  = getDb()
      const allExcl = [...excluded]
      candidates = db.prepare(`
        SELECT
          c.code, c.name, c.credits, c.level,
          s.crn, s.section, s.instructor, s.rmp_score,
          s.days, s.start_time, s.end_time, s.schedule, s.room,
          s.seats_avail, s.seats_total, s.delivery,
          s.term, s.term_label
        FROM sections s
        JOIN courses c ON c.code = s.code
        WHERE s.campus = 'Oxford'
          AND s.term = (SELECT MAX(term) FROM sections)
          AND s.seats_avail > 0
          AND c.code NOT IN (${allExcl.length ? allExcl.map(() => '?').join(',') : "''"})
        ORDER BY s.rmp_score DESC, s.seats_avail DESC
        LIMIT 60
      `).all(...(allExcl.length ? allExcl : []))
      db.close()
    } catch (dbErr) {
      console.warn('[scheduleAI] DB unavailable, will use fallback:', dbErr.message)
    }

    // ── Annotate candidates with requirement type ─────────────────────────────
    const majorData  = findMajorData(major)
    const minorData  = findMinorData(minor)
    const coreCodes  = new Set((majorData?.coreCourses    || []).map(c => c.code))
    const electCodes = new Set((majorData?.electiveGroups || []).flatMap(g => g.courses))
    const minorCodes = new Set((minorData?.requiredCourses || []).map(c => c.code))

    candidates = candidates.map(c => ({
      ...c,
      requirementType: coreCodes.has(c.code)  ? 'Major Core'
                     : minorCodes.has(c.code) ? 'Minor Required'
                     : electCodes.has(c.code) ? 'Major Elective'
                     : 'GE/Elective',
    }))

    // ── If DB is empty or offline, return a helpful no-data response ──────────
    if (candidates.length === 0) {
      return res.json({
        schedule:  [],
        reasoning: 'The course database is not yet populated. Run the scraper first, or add courses manually from the Results page.',
        warnings:  ['Database is empty — run npm run scrape to populate course data.'],
        dbEmpty:   true,
      })
    }

    // ── Ask Claude to build the schedule ─────────────────────────────────────
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      // No AI key — fall back to rule-based selection
      const fallback = buildRuleBasedSchedule(candidates, preferences, coreCodes, minorCodes)
      return res.json(fallback)
    }

    let Anthropic
    try {
      Anthropic = require('@anthropic-ai/sdk')
      if (Anthropic.default) Anthropic = Anthropic.default
    } catch {
      const fallback = buildRuleBasedSchedule(candidates, preferences, coreCodes, minorCodes)
      return res.json(fallback)
    }

    const client = new Anthropic({ apiKey })
    const profile = { major, minor, year: preferences.year, completedCourses: completed, ...preferences }
    const prompt  = buildSchedulePrompt(profile, candidates, majorData, minorData)

    const response = await client.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 800,
      messages:   [{ role: 'user', content: prompt }],
    })

    const raw = response.content?.[0]?.text?.trim() || '{}'

    // Parse Claude's JSON response
    let parsed
    try {
      // Extract JSON even if Claude adds a tiny preamble
      const match = raw.match(/\{[\s\S]*\}/)
      parsed = match ? JSON.parse(match[0]) : {}
    } catch {
      parsed = {}
    }

    const { selectedCodes = [], totalCredits, reasoning = '', warnings = [] } = parsed

    // Map selected codes back to full section objects
    const selectedSections = selectedCodes
      .map(code => candidates.find(c => c.code === code))
      .filter(Boolean)

    // If Claude returned nothing useful, fall back to rule-based
    if (selectedSections.length === 0) {
      const fallback = buildRuleBasedSchedule(candidates, preferences, coreCodes, minorCodes)
      return res.json({ ...fallback, reasoning: reasoning || fallback.reasoning })
    }

    return res.json({
      schedule:  selectedSections,
      totalCredits: totalCredits || selectedSections.reduce((s, c) => s + (Number(c.credits) || 3), 0),
      reasoning,
      warnings,
      aiBuilt:   true,
    })

  } catch (err) {
    console.error('[scheduleAI/build]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── Rule-based fallback (when no API key or DB is thin) ──────────────────────

function buildRuleBasedSchedule(candidates, preferences, coreCodes, minorCodes) {
  const target    = Number(preferences.credits) || 15
  const avoidDays = preferences.avoidDays || []

  // Sort: major core first, then minor, then by seats + score
  const sorted = [...candidates].sort((a, b) => {
    const ap = coreCodes.has(a.code) ? 3 : minorCodes.has(a.code) ? 2 : 1
    const bp = coreCodes.has(b.code) ? 3 : minorCodes.has(b.code) ? 2 : 1
    if (ap !== bp) return bp - ap
    return (b.rmp_score || 0) - (a.rmp_score || 0)
  })

  // Greedy fill — pick courses until we hit the credit target
  const selected  = []
  const usedCodes = new Set()
  let totalCr     = 0

  for (const c of sorted) {
    if (usedCodes.has(c.code)) continue
    if (avoidDays.length && avoidDays.some(d => c.days?.includes(d))) continue
    const cr = Number(c.credits) || 3
    if (totalCr + cr > target + 2) continue
    // Basic conflict check (same day + overlapping time)
    const conflict = selected.some(s => hasTimeConflict(s, c))
    if (conflict) continue
    selected.push(c)
    usedCodes.add(c.code)
    totalCr += cr
    if (totalCr >= target) break
  }

  return {
    schedule:    selected,
    totalCredits: totalCr,
    reasoning:   `Built a ${totalCr}-credit schedule prioritizing your major core requirements and available sections.`,
    warnings:    totalCr < 12 ? ['Schedule is under 12 credits — consider adding more courses.'] : [],
    aiBuilt:     false,
  }
}

function hasTimeConflict(a, b) {
  if (!a.days || !b.days || !a.start_time || !b.start_time) return false
  // Check day overlap
  const daysA = a.days.split('').filter(d => 'MTWRFS'.includes(d))
  const daysB = b.days.split('').filter(d => 'MTWRFS'.includes(d))
  const sharedDay = daysA.some(d => daysB.includes(d))
  if (!sharedDay) return false
  // Check time overlap
  const toMin = t => { const [h,m] = t.split(':').map(Number); return h * 60 + m }
  const aStart = toMin(a.start_time), aEnd = toMin(a.end_time || '23:59')
  const bStart = toMin(b.start_time), bEnd = toMin(b.end_time || '23:59')
  return aStart < bEnd && bStart < aEnd
}

module.exports = router
