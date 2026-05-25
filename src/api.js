/**
 * RegisterBuddy API client
 * All calls go through Vite's proxy (/api → localhost:3001)
 */

const BASE = '/api'

async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `API error ${res.status}`)
  }
  return res.json()
}

/**
 * Search courses — used for onboarding autocomplete
 * @param {string} search  — free text
 * @param {object} opts    — { subject, open, limit }
 */
export function searchCourses(search, opts = {}) {
  const params = new URLSearchParams({ search, limit: opts.limit ?? 20, ...opts })
  return apiFetch(`/courses?${params}`)
}

/**
 * Get degree requirements + Miami Plan gap analysis
 * @param {string}   major
 * @param {string[]} completedCourses
 * @param {object}   opts  — { planVersion, year, minor }
 */
export function getRequirements(major, completedCourses = [], opts = {}) {
  const params = new URLSearchParams({ major, completedCourses: completedCourses.join(',') })
  if (opts.planVersion) params.set('planVersion', opts.planVersion)
  if (opts.year)        params.set('year', opts.year.toLowerCase())
  if (opts.minor)       params.set('minor', opts.minor)
  return apiFetch(`/requirements?${params}`)
}

/**
 * Get ranked course recommendations
 * @param {{ major, completedCourses, preferences }} payload
 */
export function getRecommendations(payload) {
  return apiFetch('/recommend', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/**
 * AI schedule builder
 * Sends profile + preferences to Roger/Claude and gets back a complete schedule
 * @param {{ major, minor, completedCourses, preferences }} payload
 */
export function buildAISchedule(payload) {
  return apiFetch('/schedule/build', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** Health check */
export function healthCheck() {
  return apiFetch('/health')
}
