/**
 * Requirement Gap Engine
 *
 * Takes a student's completed courses + their major + available sections
 * and returns a full gap analysis:
 *   - Which Miami Plan categories are satisfied
 *   - Which major requirements are satisfied / remaining
 *   - Which available sections this semester can close each gap
 *   - Progress summary (credits, percentages)
 *
 * Usage:
 *   const { analyzeGaps } = require('./requirementGap')
 *   const result = analyzeGaps({ major, completedCourses, availableSections, planVersion })
 */

const MIAMI_PLAN  = require('../data/miamiPlan.json')
const MAJOR_REQ   = require('../data/majorRequirements.json')
const MINOR_REQ   = require('../data/minorRequirements.json')

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalise a course code to "DEPT NNN" uppercase form */
function normalise(code) {
  if (!code) return ''
  return code.toUpperCase().replace(/[\s\-]+/, ' ').trim()
}

/** Find sections from availableSections that match a list of codes */
function sectionsFor(codes, availableSections) {
  const set = new Set(codes.map(normalise))
  return availableSections
    .filter(s => set.has(normalise(s.code)))
    .map(s => ({
      code:      s.code,
      name:      s.name,
      crn:       s.crn,
      section:   s.section,
      schedule:  s.schedule,
      seatsAvail: s.seats_avail,
      delivery:  s.delivery,
      credits:   s.credits,
    }))
    .sort((a, b) => (b.seatsAvail || 0) - (a.seatsAvail || 0))
}

/** Sum credits for a list of course records from the DB */
function sumCredits(courseCodes, allCourses) {
  const map = {}
  for (const c of allCourses) map[normalise(c.code)] = c.credits || 3
  return courseCodes.reduce((sum, code) => sum + (map[normalise(code)] || 3), 0)
}

// ── Miami Plan Gap Analysis ────────────────────────────────────────────────────

/**
 * Determine which Miami Plan version applies.
 * If the user provides planVersion ('NMP' | 'GMP'), use it.
 * Otherwise guess from year: freshman/sophomore → NMP (Fall 2023+), junior/senior → GMP.
 */
function resolvePlanVersion(planVersion, year) {
  if (planVersion === 'NMP' || planVersion === 'GMP') return planVersion
  if (year === 'junior' || year === 'senior') return 'GMP'
  return 'NMP'
}

function analyzeMiamiPlan(completedSet, availableSections, planVersion) {
  const plan = MIAMI_PLAN[planVersion]
  if (!plan) return { error: `Unknown plan version: ${planVersion}` }

  const categories = plan.categories.map(cat => {
    // Which required courses has the student completed?
    const satisfyingCompleted = cat.courses.filter(c => completedSet.has(normalise(c)))

    // Is the category satisfied?
    // For thematic sequence: need at least 3 completed courses from any thematic sequence
    let satisfied = false
    let detail    = null

    if (cat.id.includes('thematic_seq')) {
      const matchedSeq = analyzThematicSequence(completedSet)
      satisfied = matchedSeq !== null
      detail    = matchedSeq
      // For closing sections: find any in-progress thematic sequence with the most courses done
      if (!satisfied) {
        const bestSeq = findBestPartialSequence(completedSet)
        if (bestSeq) {
          const remaining = bestSeq.seq.courses.filter(c => !completedSet.has(normalise(c)))
          cat = { ...cat, courses: remaining }
        } else {
          // Show starter courses from the first few sequences
          const starterCodes = MIAMI_PLAN.thematicSequences.flatMap(s => [s.courses[0]])
          cat = { ...cat, courses: starterCodes }
        }
      }
    } else {
      const completedCredits = satisfyingCompleted.length * 3 // approximate
      satisfied = satisfyingCompleted.length >= cat.minCourses &&
                  completedCredits >= cat.requiredCredits
    }

    // Which available sections could satisfy this gap?
    const closingSections = satisfied ? [] : sectionsFor(cat.courses, availableSections)

    return {
      id:                  cat.id,
      label:               cat.label,
      requiredCredits:     cat.requiredCredits,
      minCourses:          cat.minCourses,
      satisfied,
      satisfyingCompleted,
      courses:             cat.courses || [],             // ← needed by sidebar to detect scheduled/done courses
      closingSections:     closingSections.slice(0, 5),   // top 5 options
      notes:               cat.notes || null,
      detail,
    }
  })

  const satisfiedCount = categories.filter(c => c.satisfied).length
  const totalCount     = categories.length
  const creditsEarned  = categories
    .filter(c => c.satisfied)
    .reduce((s, c) => s + c.requiredCredits, 0)
  const creditsRequired = plan.totalPlanCredits

  return {
    version:   planVersion,
    label:     plan.label,
    categories,
    summary: {
      satisfiedCount,
      totalCount,
      creditsEarned,
      creditsRequired,
      percentComplete: Math.round((satisfiedCount / totalCount) * 100),
    },
  }
}

/**
 * Check if the student has completed any full thematic sequence (3 courses in same seq).
 * Returns { name, courses } of completed sequence, or null.
 */
function analyzThematicSequence(completedSet) {
  for (const seq of MIAMI_PLAN.thematicSequences) {
    const completedInSeq = seq.courses.filter(c => completedSet.has(normalise(c)))
    if (completedInSeq.length >= 3) {
      return { name: seq.name, courses: completedInSeq }
    }
  }
  return null
}

/**
 * Find the thematic sequence the student is furthest along in (most courses completed).
 */
function findBestPartialSequence(completedSet) {
  let best = null
  for (const seq of MIAMI_PLAN.thematicSequences) {
    const done = seq.courses.filter(c => completedSet.has(normalise(c))).length
    if (done > 0 && (best === null || done > best.done)) {
      best = { seq, done }
    }
  }
  return best
}

// ── Major Gap Analysis ────────────────────────────────────────────────────────

/**
 * Fuzzy major lookup — tries exact, case-insensitive, starts-with, then word-overlap.
 * Returns { key, data } or null.
 */
function findMajorData(major) {
  if (!major) return null

  // 1. Exact match
  if (MAJOR_REQ[major]) return { key: major, data: MAJOR_REQ[major] }

  // 2. Case-insensitive exact
  const lower = major.toLowerCase().trim()
  for (const [key, val] of Object.entries(MAJOR_REQ)) {
    if (key.toLowerCase() === lower) return { key, data: val }
  }

  // 3. Starts-with either direction (handles "Information Systems" → "Information Systems & Analytics")
  for (const [key, val] of Object.entries(MAJOR_REQ)) {
    const kl = key.toLowerCase()
    if (kl.startsWith(lower) || lower.startsWith(kl)) return { key, data: val }
  }

  // 4. Significant keyword overlap (≥60% of meaningful words match)
  const inputWords = lower.split(/\s+/).filter(w => w.length > 3)
  let bestMatch = null
  let bestScore = 0
  for (const [key, val] of Object.entries(MAJOR_REQ)) {
    const keyWords = key.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    const overlap  = inputWords.filter(w => keyWords.some(kw => kw.includes(w) || w.includes(kw))).length
    const score    = overlap / Math.max(inputWords.length, keyWords.length, 1)
    if (score > 0.6 && score > bestScore) {
      bestScore = score
      bestMatch = { key, data: val }
    }
  }
  return bestMatch
}

function analyzeMajor(major, completedSet, availableSections) {
  const match = findMajorData(major)
  const req   = match?.data
  if (!req) {
    // Return a "not found" shape so callers can handle gracefully
    return {
      major,
      found: false,
      message: `No requirements data for "${major}". Available: ${Object.keys(MAJOR_REQ).join(', ')}`,
    }
  }
  // Use the canonical key from the JSON (in case fuzzy matching resolved it)
  const canonicalMajor = match.key

  // ── Core courses ──
  const coreAnalysis = req.coreCourses.map(c => {
    const completed = completedSet.has(normalise(c.code))
    const prereqsMet = c.prereqs.every(p => completedSet.has(normalise(p)))

    // Find available section
    const sections = sectionsFor([c.code], availableSections)
    const openSections = sections.filter(s => (s.seatsAvail || 0) > 0)

    return {
      code:         c.code,
      name:         c.name,
      credits:      c.credits,
      year:         c.year,
      semester:     c.semester,
      prereqs:      c.prereqs,
      completed,
      prereqsMet,
      available:    sections.length > 0,
      openSections: openSections.slice(0, 3),
      // recommended = not completed, prereqs met, available this term
      recommended:  !completed && prereqsMet && sections.length > 0,
    }
  })

  const coreCompleted    = coreAnalysis.filter(c => c.completed)
  const coreRemaining    = coreAnalysis.filter(c => !c.completed)
  const coreReady        = coreRemaining.filter(c => c.prereqsMet && c.available)
  const coreBlocked      = coreRemaining.filter(c => !c.prereqsMet)
  const coreUnavailable  = coreRemaining.filter(c => c.prereqsMet && !c.available)

  // ── Elective groups ──
  const electiveAnalysis = (req.electiveGroups || []).map(group => {
    const completedInGroup = group.courses.filter(c => completedSet.has(normalise(c)))
    const creditsEarned    = completedInGroup.length * 3 // approx
    const satisfied        = creditsEarned >= group.requiredCredits
    const remaining        = Math.max(0, group.requiredCredits - creditsEarned)
    const gapCodes         = group.courses.filter(c => !completedSet.has(normalise(c)))
    const closingSections  = satisfied ? [] : sectionsFor(gapCodes, availableSections).slice(0, 6)

    return {
      name:              group.name,
      description:       group.description,
      requiredCredits:   group.requiredCredits,
      creditsEarned,
      satisfied,
      remaining,
      completedCourses:  completedInGroup,
      closingSections,
    }
  })

  // ── Credit totals ──
  const coreCreditsRequired  = req.coreCourses.reduce((s, c) => s + c.credits, 0)
  const coreCreditsEarned    = coreCompleted.reduce((s, c) => s + c.credits, 0)
  const electiveCreditsReq   = (req.electiveGroups || []).reduce((s, g) => s + g.requiredCredits, 0)
  const electiveCreditsEarned= electiveAnalysis.reduce((s, g) => s + Math.min(g.creditsEarned, g.requiredCredits), 0)
  const majorCreditsEarned   = coreCreditsEarned + electiveCreditsEarned
  const majorCreditsRequired = req.majorCredits || (coreCreditsRequired + electiveCreditsReq)

  // ── Next up: which courses are ready to take this term? ──
  const nextUp = [
    ...coreReady.map(c => ({
      code:        c.code,
      name:        c.name,
      type:        'core',
      sections:    c.openSections,
      reason:      'Required core — prerequisites met',
    })),
    ...electiveAnalysis
      .filter(g => !g.satisfied && g.closingSections.length > 0)
      .flatMap(g => g.closingSections.slice(0, 2).map(s => ({
        code:    s.code,
        name:    s.name,
        type:    'elective',
        sections:[s],
        reason:  `Counts toward "${g.name}"`,
      }))),
  ]

  return {
    major:   canonicalMajor,
    found:   true,
    college: req.college,
    degree:  req.degree,
    totalCredits:           req.totalCredits,
    majorCreditsRequired,
    majorCreditsEarned,
    majorPercentComplete:   Math.round((majorCreditsEarned / majorCreditsRequired) * 100),
    core: {
      total:       coreAnalysis.length,
      completed:   coreCompleted.length,
      remaining:   coreRemaining.length,
      ready:       coreReady.length,
      blocked:     coreBlocked.length,
      courses:     coreAnalysis,
    },
    electiveGroups: electiveAnalysis,
    nextUp:         nextUp.slice(0, 8),
    suggestedOrder: req.suggestedOrder || {},
  }
}

// ── Minor Gap Analysis ────────────────────────────────────────────────────────

/**
 * Pre-computed sorted list of available minors (for onboarding dropdown).
 */
const AVAILABLE_MINORS = Object.keys(MINOR_REQ)
  .filter(k => !k.startsWith('_'))
  .sort()

/**
 * Fuzzy minor lookup — exact, case-insensitive, starts-with, keyword overlap.
 */
function findMinorData(minor) {
  if (!minor) return null
  if (MINOR_REQ[minor]) return { key: minor, data: MINOR_REQ[minor] }
  const lower = minor.toLowerCase().trim()
  for (const [key, val] of Object.entries(MINOR_REQ)) {
    if (key.toLowerCase() === lower) return { key, data: val }
  }
  for (const [key, val] of Object.entries(MINOR_REQ)) {
    const kl = key.toLowerCase()
    if (kl.startsWith(lower) || lower.startsWith(kl)) return { key, data: val }
  }
  const inputWords = lower.split(/\s+/).filter(w => w.length > 3)
  let bestMatch = null, bestScore = 0
  for (const [key, val] of Object.entries(MINOR_REQ)) {
    const keyWords = key.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    const overlap  = inputWords.filter(w => keyWords.some(kw => kw.includes(w) || w.includes(kw))).length
    const score    = overlap / Math.max(inputWords.length, keyWords.length, 1)
    if (score > 0.6 && score > bestScore) { bestScore = score; bestMatch = { key, data: val } }
  }
  return bestMatch
}

/**
 * Analyze a student's progress toward a minor.
 */
function analyzeMinor(minor, completedSet, availableSections) {
  if (!minor) return null
  const match = findMinorData(minor)
  const req   = match?.data
  if (!req) {
    return {
      minor,
      found: false,
      message: `No requirements data for minor "${minor}". Available: ${AVAILABLE_MINORS.join(', ')}`,
    }
  }
  const canonicalMinor = match.key

  // ── Required courses ──
  const requiredAnalysis = (req.requiredCourses || []).map(c => {
    const completed   = completedSet.has(normalise(c.code))
    const prereqsMet  = c.prereqs.every(p => completedSet.has(normalise(p)))
    const sections    = sectionsFor([c.code], availableSections)
    const openSections = sections.filter(s => (s.seatsAvail || 0) > 0)
    return {
      code:        c.code,
      name:        c.name,
      credits:     c.credits,
      prereqs:     c.prereqs,
      completed,
      prereqsMet,
      available:   sections.length > 0,
      openSections: openSections.slice(0, 3),
      recommended: !completed && prereqsMet && sections.length > 0,
    }
  })

  const reqCompleted   = requiredAnalysis.filter(c => c.completed)
  const reqRemaining   = requiredAnalysis.filter(c => !c.completed)
  const reqReady       = reqRemaining.filter(c => c.prereqsMet && c.available)
  const reqBlocked     = reqRemaining.filter(c => !c.prereqsMet)
  const reqCreditsEarned  = reqCompleted.reduce((s, c) => s + (c.credits || 3), 0)
  const reqCreditsTotal   = requiredAnalysis.reduce((s, c) => s + (c.credits || 3), 0)

  // ── Elective group ──
  const electiveCodes      = req.electiveCourses || []
  const electiveRequired   = req.electiveCreditsRequired || 0
  const completedElectives = electiveCodes.filter(c => completedSet.has(normalise(c)))
  const electiveEarned     = completedElectives.length * 3  // approximate
  const electiveSatisfied  = electiveEarned >= electiveRequired
  const gapCodes           = electiveCodes.filter(c => !completedSet.has(normalise(c)))
  const electiveSections   = electiveSatisfied ? [] : sectionsFor(gapCodes, availableSections).slice(0, 6)

  // ── Credits ──
  const creditsEarned  = reqCreditsEarned + Math.min(electiveEarned, electiveRequired)
  const creditsRequired = req.requiredCredits
  const percentComplete = Math.round((creditsEarned / creditsRequired) * 100)

  // ── Next up ──
  const nextUp = [
    ...reqReady.slice(0, 4).map(c => ({
      code:    c.code,
      name:    c.name,
      type:    'required',
      sections: c.openSections,
      reason:  `Required for ${canonicalMinor} minor — prerequisites met`,
    })),
    ...(!electiveSatisfied && electiveSections.length > 0
      ? electiveSections.slice(0, 2).map(s => ({
          code:    s.code,
          name:    s.name,
          type:    'elective',
          sections: [s],
          reason:  `Counts as ${canonicalMinor} minor elective`,
        }))
      : []),
  ]

  return {
    minor:        canonicalMinor,
    found:        true,
    college:      req.college,
    description:  req.description,
    creditsRequired,
    creditsEarned,
    percentComplete: Math.min(100, percentComplete),
    notes:        req.notes || null,
    required: {
      total:      requiredAnalysis.length,
      completed:  reqCompleted.length,
      remaining:  reqRemaining.length,
      ready:      reqReady.length,
      blocked:    reqBlocked.length,
      courses:    requiredAnalysis,
    },
    electives: {
      requiredCredits:  electiveRequired,
      earnedCredits:    Math.min(electiveEarned, electiveRequired),
      satisfied:        electiveSatisfied,
      completedCourses: completedElectives,
      closingSections:  electiveSections,
    },
    nextUp: nextUp.slice(0, 6),
  }
}

// ── Overall Summary ───────────────────────────────────────────────────────────

function buildOverallSummary(miamiPlanResult, majorResult) {
  const mpPercent    = miamiPlanResult?.summary?.percentComplete ?? 0
  const majorPercent = majorResult?.found ? (majorResult.majorPercentComplete ?? 0) : 0

  // Combined completion estimate (weight: 30% Miami Plan, 70% major)
  const overallPercent = Math.round(mpPercent * 0.3 + majorPercent * 0.7)

  const totalCreditsEarned = (miamiPlanResult?.summary?.creditsEarned ?? 0) +
                             (majorResult?.majorCreditsEarned ?? 0)
  const totalCreditsRequired = (miamiPlanResult?.summary?.creditsRequired ?? 36) +
                               (majorResult?.majorCreditsRequired ?? 55)

  return {
    overallPercent,
    mpPercent,
    majorPercent,
    totalCreditsEarned,
    totalCreditsRequired,
    creditsToGraduate: Math.max(0, 128 - totalCreditsEarned),
  }
}

// ── Main Entry Point ──────────────────────────────────────────────────────────

/**
 * analyzeGaps
 *
 * @param {object} opts
 * @param {string}   opts.major              — e.g. "Computer Science"
 * @param {string}   [opts.minor]            — e.g. "Psychology"
 * @param {string[]} opts.completedCourses   — e.g. ["CSE 148", "MTH 151"]
 * @param {object[]} opts.availableSections  — rows from DB (code, crn, schedule, seats_avail, …)
 * @param {string}   [opts.planVersion]      — 'NMP' | 'GMP' (auto-detected if omitted)
 * @param {string}   [opts.year]             — 'freshman' | 'sophomore' | 'junior' | 'senior'
 *
 * @returns {object} Full gap analysis
 */
function analyzeGaps({ major, minor, completedCourses = [], availableSections = [], planVersion, year }) {
  // Normalize completed courses into a fast-lookup Set
  const completedSet = new Set(completedCourses.map(normalise))

  // Resolve which Miami Plan version applies
  const resolvedPlan = resolvePlanVersion(planVersion, year)

  // Run all analyses
  const miamiPlan = analyzeMiamiPlan(completedSet, availableSections, resolvedPlan)
  const majorData = analyzeMajor(major, completedSet, availableSections)
  const minorData = minor ? analyzeMinor(minor, completedSet, availableSections) : null
  const summary   = buildOverallSummary(miamiPlan, majorData)

  return {
    planVersion: resolvedPlan,
    completedCourses: [...completedSet],
    miamiPlan,
    major:   majorData,
    minor:   minorData,
    summary,
  }
}

module.exports = { analyzeGaps, AVAILABLE_MINORS }
