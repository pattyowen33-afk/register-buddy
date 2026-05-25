/**
 * User profile persistence — localStorage
 * Saves student data so they never have to re-enter it.
 */

const PROFILE_KEY  = 'rb_profile_v2'
const SCHEDULE_KEY = 'rb_schedule_v2'
const ROGER_KEY    = 'rb_roger'
const PLAN_KEY     = 'rb_plan_v1'

// ── Profile ───────────────────────────────────────────────────────────────────

export function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

/**
 * Save or merge profile fields.
 * Always merges so partial updates (e.g. just adding email) don't wipe other data.
 */
export function saveProfile(data) {
  try {
    const existing = loadProfile() || {}
    const merged = { ...existing, ...data, updatedAt: Date.now() }
    localStorage.setItem(PROFILE_KEY, JSON.stringify(merged))
    return merged
  } catch { return data }
}

export function clearProfile() {
  localStorage.removeItem(PROFILE_KEY)
  localStorage.removeItem(SCHEDULE_KEY)
}

// ── Schedule ──────────────────────────────────────────────────────────────────

export function loadSavedSchedule() {
  try {
    const raw = localStorage.getItem(SCHEDULE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function saveSchedule(sections) {
  try {
    localStorage.setItem(SCHEDULE_KEY, JSON.stringify({
      sections,
      savedAt: Date.now(),
    }))
  } catch {}
}

export function clearSchedule() {
  localStorage.removeItem(SCHEDULE_KEY)
}

// ── My Plan ───────────────────────────────────────────────────────────────────

/** Load saved plan courses (array of course objects). */
export function loadPlan() {
  try {
    const raw = localStorage.getItem(PLAN_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

/** Overwrite the full plan. */
export function savePlan(courses) {
  try {
    localStorage.setItem(PLAN_KEY, JSON.stringify(courses))
  } catch {}
}

/** Add a course to the plan (deduplicates by code). */
export function addToPlan(course) {
  const plan = loadPlan()
  if (plan.some(c => c.code === course.code)) return plan
  const next = [...plan, { ...course, addedAt: Date.now() }]
  savePlan(next)
  return next
}

/** Remove a course from the plan by code. */
export function removeFromPlan(code) {
  const next = loadPlan().filter(c => c.code !== code)
  savePlan(next)
  return next
}

/** Clear the entire plan. */
export function clearPlan() {
  localStorage.removeItem(PLAN_KEY)
}

// ── Roger SDR state ───────────────────────────────────────────────────────────

export function getRogerState() {
  try {
    const raw = localStorage.getItem(ROGER_KEY)
    return raw ? JSON.parse(raw) : { shown: false, email: null, convertedAt: null }
  } catch {
    return { shown: false, email: null, convertedAt: null }
  }
}

export function setRogerState(patch) {
  try {
    const current = getRogerState()
    localStorage.setItem(ROGER_KEY, JSON.stringify({ ...current, ...patch }))
  } catch {}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true if this is a brand-new visitor (no profile at all). */
export function isNewVisitor() {
  return !loadProfile() && !getRogerState().shown
}

/** Returns a greeting name — first name from profile or "there". */
export function getGreetingName() {
  const p = loadProfile()
  if (!p?.name) return 'there'
  return p.name.split(' ')[0]
}
