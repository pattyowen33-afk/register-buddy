/**
 * Stripe checkout routes
 *
 * POST /api/stripe/create-checkout
 *   Dev mode  (no STRIPE_SECRET_KEY): returns { devMode: true, subscription }
 *   Prod mode (key set):              returns { url } to redirect user to
 *
 * GET  /api/stripe/verify?session_id=...
 *   Verifies a completed Stripe checkout session and returns subscription data
 */

const express = require('express')
const router  = express.Router()

const PLANS = {
  semester: { name: 'Semester',  priceUsd: 10, months: 4  },
  annual:   { name: 'Full Year', priceUsd: 18, months: 12 },
}

function expiresAt(months) {
  return Date.now() + months * 30 * 24 * 60 * 60 * 1000
}

// ── POST /api/stripe/create-checkout ─────────────────────────────────────────

router.post('/create-checkout', async (req, res) => {
  try {
    const { plan, email, successUrl, cancelUrl } = req.body
    const planData = PLANS[plan]
    if (!planData) return res.status(400).json({ error: `Unknown plan: ${plan}` })

    const stripeKey = process.env.STRIPE_SECRET_KEY
    if (!stripeKey) {
      // ── Dev mode: activate immediately without real payment ──
      console.log(`[stripe] Dev mode — activating ${plan} plan for ${email || 'anonymous'}`)
      return res.json({
        devMode: true,
        subscription: {
          status:      'active',
          plan,
          expiresAt:   expiresAt(planData.months),
          activatedAt: Date.now(),
          email:       email || null,
        },
      })
    }

    // ── Prod mode: real Stripe checkout ──
    let stripe
    try {
      stripe = require('stripe')(stripeKey)
    } catch {
      return res.status(500).json({ error: 'Stripe package not installed — run: npm install stripe' })
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: email || undefined,
      metadata: { plan },
      line_items: [{
        price_data: {
          currency:     'usd',
          unit_amount:  planData.priceUsd * 100, // cents
          product_data: {
            name:        `RegisterBuddy — ${planData.name}`,
            description: `Full access for ${planData.months} months`,
          },
        },
        quantity: 1,
      }],
      success_url: (successUrl || 'http://localhost:5173/results') + '?session_id={CHECKOUT_SESSION_ID}',
      cancel_url:  cancelUrl  || 'http://localhost:5173/results',
    })

    res.json({ url: session.url })
  } catch (err) {
    console.error('[stripe/create-checkout]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ── GET /api/stripe/verify ────────────────────────────────────────────────────

router.get('/verify', async (req, res) => {
  try {
    const { session_id } = req.query
    if (!session_id) return res.status(400).json({ error: 'Missing session_id' })

    const stripeKey = process.env.STRIPE_SECRET_KEY
    if (!stripeKey) return res.status(400).json({ error: 'Stripe not configured on this server' })

    let stripe
    try {
      stripe = require('stripe')(stripeKey)
    } catch {
      return res.status(500).json({ error: 'Stripe package not installed' })
    }

    const session = await stripe.checkout.sessions.retrieve(session_id)
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment not completed' })
    }

    const plan     = session.metadata?.plan || 'semester'
    const planData = PLANS[plan] || PLANS.semester

    res.json({
      status:      'active',
      plan,
      expiresAt:   expiresAt(planData.months),
      activatedAt: Date.now(),
      email:       session.customer_details?.email || null,
    })
  } catch (err) {
    console.error('[stripe/verify]', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
