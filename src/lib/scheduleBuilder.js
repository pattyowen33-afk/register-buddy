/**
 * Schedule Builder — auto-generates a conflict-free, credit-balanced semester schedule
 * from the gap analysis returned by /api/requirements.
 *
 * Rules:
 *  - Never recommends already-completed courses
 *  - Enforces 12–18 credit hour range
 *  - Detects meeting-time conflicts
 *  - Prioritises: major core → Miami Plan gaps → major electives
 *  - A course that fills multiple requirements is counted only once
 */

// ── Day helpers ────────────────────────────────────────────────────────────────

const DAY_MAP = { M: 1, T: 2, W: 3, R: 4, F: 5, U: 0, S: 6 }

/** Parse a days string like "MWF" or "TR" into an array of day numbers. */
export function parseDays(days) {
  if (!days) return []
  const result = []
  for (const ch of days) {
    if (DAY_MAP[ch] !== undefined) result.push(DAY_MAP[ch])
  }
  return result
}

/** Parse "HH:MM" (24-hr) into total minutes from midnight. */
export function parseTime(t) {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/**
 * Returns true if two sections overlap in time on at least one shared day.
 */
export function hasConflict(a, b) {
  if (!a.days || !b.days || !a.start_time || !b.start_time) return false
  const daysA = parseDays(a.days)
  const daysB = parseDays(b.days)
  const sharedDay = daysA.some(d => daysB.includes(d))
  if (!sharedDay) return false

  const aStart = parseTime(a.start_time)
  const aEnd   = parseTime(a.end_time)
  const bStart = parseTime(b.start_time)
  const bEnd   = parseTime(b.end_time)

  // Overlap if neither ends before the other starts
  return aStart < bEnd && bStart < aEnd
}

/** Check if a candidate conflicts with any section in the current basket. */
export function conflictsWithBasket(candidate, basket) {
  return basket.some(s => hasConflict(candidate, s))
}

// ── Requirement labeling ──────────────────────────────────────────────────────

/**
 * Given a section and the gap analysis, return which requirement(s) it satisfies.
 * A section can satisfy both a Miami Plan gap AND a major requirement.
 */
export function getRequirementLabels(section, gapData) {
  const labels = []
  if (!gapData) return labels
  const code = section.code?.toUpperCase()

  // Check Miami Plan
  for (const cat of (gapData.miamiPlan?.categories || [])) {
    if (!cat.satisfied && cat.courses?.some(c => c.toUpperCase() === code)) {
      labels.push({ type: 'miamiPlan', label: cat.label, id: cat.id })
    }
  }

  // Check major core
  for (const course of (gapData.major?.core?.courses || [])) {
    if (course.code?.toUpperCase() === code && !course.completed) {
      labels.push({ type: 'majorCore', label: `Major Core: ${course.name}`, id: course.code })
    }
  }

  // Check major elective groups
  for (const group of (gapData.major?.electiveGroups || [])) {
    if (!group.satisfied && group.closingSections?.some(s => s.code?.toUpperCase() === code)) {
      labels.push({ type: 'elective', label: group.name, id: group.name })
    }
  }

  return labels
}

// ── Candidate pool builder ─────────────────────────────────────────────────────

/**
 * Build a ranked list of candidate sections from the gap analysis.
 * Each candidate gets a priority score and a list of requirements it fills.
 */
function buildCandidatePool(gapData, completedSet) {
  const candidates = []
  const seen = new Set() // deduplicate by CRN

  function addCandidate(section, priority, fulfills) {
    if (!section?.crn || seen.has(section.crn)) return
    if (completedSet.has(section.code?.toUpperCase())) return
    if (!section.seatsAvail && !section.seats_avail) return  // no seats
    seen.add(section.crn)
    candidates.push({
      ...section,
      seats_avail: section.seatsAvail ?? section.seats_avail ?? 0,
      priority,
      fulfills, // array of { type, label }
    })
  }

  // Priority 1 — Major core courses that are ready (prereqs met, not completed)
  for (const c of (gapData.major?.core?.courses || [])) {
    if (c.completed || !c.prereqsMet) continue
    for (const s of (c.openSections || [])) {
      addCandidate(s, 1, [{ type: 'majorCore', label: c.name, id: c.code }])
    }
  }

  // Priority 2 — Miami Plan gaps (open categories)
  for (const cat of (gapData.miamiPlan?.categories || [])) {
    if (cat.satisfied) continue
    for (const s of (cat.closingSections || [])) {
      // If already in pool, upgrade its fulfills list
      const existing = candidates.find(c => c.crn === s.crn)
      if (existing) {
        existing.fulfills.push({ type: 'miamiPlan', label: cat.label, id: cat.id })
        existing.priority = Math.min(existing.priority, 2)
        continue
      }
      addCandidate(s, 2, [{ type: 'miamiPlan', label: cat.label, id: cat.id }])
    }
  }

  // Priority 3 — Major electives (unsatisfied groups)
  for (const group of (gapData.major?.electiveGroups || [])) {
    if (group.satisfied) continue
    for (const s of (group.closingSections || [])) {
      addCandidate(s, 3, [{ type: 'elective', label: group.name, id: group.name }])
    }
  }

  // Sort: priority asc, then seats desc, then avoid 8am
  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    const aStart = parseTime(a.start_time)
    const bStart = parseTime(b.start_time)
    const aGood  = aStart >= 9 * 60 ? 1 : 0   // prefer 9am+
    const bGood  = bStart >= 9 * 60 ? 1 : 0
    if (aGood !== bGood) return bGood - aGood
    return (b.seats_avail || 0) - (a.seats_avail || 0)
  })

  return candidates
}

// ── Main builder ──────────────────────────────────────────────────────────────

/**
 * Build an optimal schedule.
 *
 * @param {object} gapData       — result from analyzeGaps / /api/requirements
 * @param {string[]} completed   — already-completed course codes (uppercase)
 * @param {object}  opts
 * @param {number}  opts.target  — target credits (default 15)
 * @param {number}  opts.min     — minimum credits (default 12)
 * @param {number}  opts.max     — maximum credits (default 18)
 *
 * @returns {{ sections: object[], totalCredits: number, warnings: string[] }}
 */
export function buildSchedule(gapData, completed = [], opts = {}) {
  const { target = 15, min = 12, max = 18 } = opts
  const completedSet = new Set(completed.map(c => c.toUpperCase()))

  if (!gapData) return { sections: [], totalCredits: 0, warnings: ['No gap data available'] }

  const candidates = buildCandidatePool(gapData, completedSet)
  const basket = []
  let totalCredits = 0
  const warnings = []
  const usedCodes = new Set()

  for (const candidate of candidates) {
    const credits = Number(candidate.credits) || 3
    if (usedCodes.has(candidate.code?.toUpperCase())) continue
    if (totalCredits + credits > max) continue
    if (conflictsWithBasket(candidate, basket)) continue

    basket.push(candidate)
    usedCodes.add(candidate.code?.toUpperCase())
    totalCredits += credits

    if (totalCredits >= target) break
  }

  if (totalCredits < min) {
    warnings.push(`Schedule only has ${totalCredits} credits. Try adding electives to reach ${min}.`)
  }
  if (totalCredits > max) {
    warnings.push(`Schedule exceeds ${max} credits. Please remove a course.`)
  }

  return { sections: basket, totalCredits, warnings }
}

// ── Calendar positioning ──────────────────────────────────────────────────────

const CALENDAR_START = 7 * 60  // 7:00 AM in minutes
const PIXELS_PER_MIN = 1.4     // px per minute of class time

export function getCalendarStyle(section) {
  if (!section.start_time || !section.end_time) return null
  const start = parseTime(section.start_time)
  const end   = parseTime(section.end_time)
  const top   = (start - CALENDAR_START) * PIXELS_PER_MIN
  const height= (end - start) * PIXELS_PER_MIN
  return { top: `${top}px`, height: `${height}px` }
}

export const CALENDAR_TOTAL_HEIGHT = (14 * 60) * PIXELS_PER_MIN  // 7am–9pm

// ── Color palette by requirement type ────────────────────────────────────────

export const CATEGORY_COLORS = {
  majorCore:  { bg: 'bg-red-100 dark:bg-red-950/60',      border: 'border-red-400 dark:border-red-600',     text: 'text-red-800 dark:text-red-300',      dot: 'bg-red-500',      badge: 'bg-red-500'      },
  miamiPlan:  { bg: 'bg-blue-100 dark:bg-blue-950/60',    border: 'border-blue-400 dark:border-blue-600',   text: 'text-blue-800 dark:text-blue-300',    dot: 'bg-blue-500',     badge: 'bg-blue-500'     },
  elective:   { bg: 'bg-gray-100 dark:bg-gray-700',       border: 'border-gray-400 dark:border-gray-500',   text: 'text-gray-700 dark:text-gray-300',    dot: 'bg-gray-400',     badge: 'bg-gray-400'     },
  nmp_eng_comp:       { bg: 'bg-emerald-50 dark:bg-emerald-950/60',  border: 'border-emerald-400 dark:border-emerald-600', text: 'text-emerald-800 dark:text-emerald-300', dot: 'bg-emerald-500', badge: 'bg-emerald-500' },
  nmp_quant:          { bg: 'bg-violet-50 dark:bg-violet-950/60',    border: 'border-violet-400 dark:border-violet-600',  text: 'text-violet-800 dark:text-violet-300',   dot: 'bg-violet-500',  badge: 'bg-violet-500'  },
  nmp_nat_sci:        { bg: 'bg-teal-50 dark:bg-teal-950/60',        border: 'border-teal-400 dark:border-teal-600',      text: 'text-teal-800 dark:text-teal-300',       dot: 'bg-teal-500',    badge: 'bg-teal-500'    },
  nmp_creative_arts:  { bg: 'bg-orange-50 dark:bg-orange-950/60',    border: 'border-orange-400 dark:border-orange-600',  text: 'text-orange-800 dark:text-orange-300',   dot: 'bg-orange-500',  badge: 'bg-orange-500'  },
  nmp_humanities:     { bg: 'bg-purple-50 dark:bg-purple-950/60',    border: 'border-purple-400 dark:border-purple-600',  text: 'text-purple-800 dark:text-purple-300',   dot: 'bg-purple-500',  badge: 'bg-purple-500'  },
  nmp_social_sci:     { bg: 'bg-sky-50 dark:bg-sky-950/60',          border: 'border-sky-400 dark:border-sky-600',        text: 'text-sky-800 dark:text-sky-300',         dot: 'bg-sky-500',     badge: 'bg-sky-500'     },
  nmp_global_inquiry: { bg: 'bg-cyan-50 dark:bg-cyan-950/60',        border: 'border-cyan-400 dark:border-cyan-600',      text: 'text-cyan-800 dark:text-cyan-300',       dot: 'bg-cyan-500',    badge: 'bg-cyan-500'    },
  nmp_ethical:        { bg: 'bg-lime-50 dark:bg-lime-950/60',        border: 'border-lime-400 dark:border-lime-600',      text: 'text-lime-800 dark:text-lime-300',       dot: 'bg-lime-500',    badge: 'bg-lime-500'    },
  nmp_adv_writing:    { bg: 'bg-amber-50 dark:bg-amber-950/60',      border: 'border-amber-400 dark:border-amber-600',    text: 'text-amber-800 dark:text-amber-300',     dot: 'bg-amber-500',   badge: 'bg-amber-500'   },
  nmp_thematic_seq:   { bg: 'bg-pink-50 dark:bg-pink-950/60',        border: 'border-pink-400 dark:border-pink-600',      text: 'text-pink-800 dark:text-pink-300',       dot: 'bg-pink-500',    badge: 'bg-pink-500'    },
}

export function getColor(section) {
  const type = section.fulfills?.[0]?.type
  const id   = section.fulfills?.[0]?.id
  return CATEGORY_COLORS[id] || CATEGORY_COLORS[type] || CATEGORY_COLORS.elective
}
