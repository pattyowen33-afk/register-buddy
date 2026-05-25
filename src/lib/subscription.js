/**
 * RegisterBuddy subscription management
 * Persists subscription state in localStorage.
 * In dev mode (no Stripe key), the server returns a mock activation so
 * developers can test the full paid flow without a real card.
 */

const SUB_KEY = 'rb_subscription_v1'

// ── Plan definitions (mirrors server) ─────────────────────────────────────────

export const PLANS = {
  semester: {
    id:       'semester',
    label:    'Semester',
    price:    10,
    months:   4,
    desc:     'One registration window',
    badge:    null,
  },
  annual: {
    id:       'annual',
    label:    'Full Year',
    price:    18,
    months:   12,
    desc:     'Fall + Spring covered',
    badge:    'Best value',
  },
}

// ── Storage helpers ───────────────────────────────────────────────────────────

export function loadSubscription() {
  try {
    const raw = localStorage.getItem(SUB_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function saveSubscription(data) {
  try {
    localStorage.setItem(SUB_KEY, JSON.stringify({ ...data, updatedAt: Date.now() }))
    return data
  } catch { return data }
}

export function clearSubscription() {
  localStorage.removeItem(SUB_KEY)
}

// ── Status checks ─────────────────────────────────────────────────────────────

/** Returns true if user has a valid, non-expired subscription */
export function isSubscribed() {
  const sub = loadSubscription()
  if (!sub || sub.status !== 'active') return false
  if (sub.expiresAt && Date.now() > sub.expiresAt) return false
  return true
}

/** Returns the plan id ('semester' | 'annual') or null */
export function getSubscriptionPlan() {
  if (!isSubscribed()) return null
  return loadSubscription()?.plan || null
}

/** Human-readable status string for display */
export function getSubscriptionLabel() {
  const sub = loadSubscription()
  if (!isSubscribed()) return null
  const plan = PLANS[sub.plan]
  if (!sub.expiresAt) return plan?.label || 'Active'
  const exp = new Date(sub.expiresAt)
  const fmt = exp.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  return `${plan?.label || 'Active'} — expires ${fmt}`
}

// ── Checkout ──────────────────────────────────────────────────────────────────

/**
 * Initiate checkout.
 *
 * Try the server first:
 *   - If STRIPE_SECRET_KEY is set  → server creates a Stripe session → redirect to Stripe.
 *   - If no key (dev mode)         → server returns { devMode, subscription } → activate locally.
 *
 * If the server is unreachable or returns any error, fall back to local
 * activation so the unlock always works during development.
 */
export async function startCheckout(planId, email = '') {
  const plan = PLANS[planId]
  if (!plan) throw new Error('Unknown plan')

  // ── Try server ──────────────────────────────────────────────────────────────
  try {
    const res = await fetch('/api/stripe/create-checkout', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan:       planId,
        email,
        successUrl: window.location.origin + '/results',
        cancelUrl:  window.location.href,
      }),
    })

    if (res.ok) {
      const data = await res.json()

      // Dev mode from server — subscription already built
      if (data.devMode && data.subscription) {
        saveSubscription(data.subscription)
        return { devMode: true }
      }

      // Prod mode — redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url
        return { redirecting: true }
      }
    }
    // Non-OK or unexpected response → fall through to local activation
  } catch {
    // Server offline → fall through to local activation
  }

  // ── Local dev activation (no server required) ───────────────────────────────
  saveSubscription({
    status:      'active',
    plan:        planId,
    expiresAt:   Date.now() + plan.months * 30 * 24 * 60 * 60 * 1000,
    activatedAt: Date.now(),
    email:       email || null,
  })
  return { devMode: true }
}

/**
 * Called on the success-redirect page (/results?session_id=...)
 * Verifies the Stripe session and saves the subscription.
 */
export async function verifyCheckout(sessionId) {
  const res = await fetch(`/api/stripe/verify?session_id=${sessionId}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Verification failed')
  }
  const data = await res.json()
  saveSubscription(data)
  return data
}
