/**
 * Email routes for Roger SDR agent
 *
 * POST /api/email/capture   — saves email lead (log + optional Resend)
 * POST /api/email/retention — sends exit-intent retention email
 *
 * Emails are sent via Resend if RESEND_API_KEY is set in .env.
 * Without it the routes still succeed (just log to console) so the frontend
 * never errors out in development.
 */

const express = require('express')
const router  = express.Router()

// ── Tiny Resend helper ────────────────────────────────────────────────────────

async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.log(`[email] (no RESEND_API_KEY) would send to ${to}: "${subject}"`)
    return { ok: true, simulated: true }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:    process.env.EMAIL_FROM || 'Roger <roger@registerbuddy.com>',
      to:      [to],
      subject,
      html,
    }),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.message || 'Resend error')
  return data
}

// ── POST /api/email/capture ───────────────────────────────────────────────────

router.post('/capture', async (req, res) => {
  try {
    const { email, source = 'roger_welcome' } = req.body
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Invalid email' })
    }

    console.log(`[Roger] Email captured: ${email} (source: ${source})`)

    // Send welcome email
    await sendEmail({
      to:      email,
      subject: '🎓 Roger here — your RegisterBuddy schedule is waiting',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">
          <div style="background:linear-gradient(135deg,#C3262A,#9b1c1c);padding:32px 24px;text-align:center;border-radius:12px 12px 0 0">
            <div style="font-size:48px;margin-bottom:8px">🎓</div>
            <h1 style="color:white;margin:0;font-size:22px">Hi from Roger!</h1>
            <p style="color:#fca5a5;margin:8px 0 0;font-size:14px">Your AI schedule assistant at RegisterBuddy</p>
          </div>
          <div style="background:white;padding:28px 24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px">
            <p style="font-size:15px;line-height:1.6;margin:0 0 16px">
              Great news — I'm already working on a conflict-free semester schedule that checks off your Miami Plan <em>and</em> major requirements automatically.
            </p>
            <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px;margin:0 0 20px">
              <p style="margin:0;font-size:13px;color:#7f1d1d;font-weight:600">What I'm doing for you:</p>
              <ul style="margin:8px 0 0;padding-left:18px;font-size:13px;color:#991b1b;line-height:1.7">
                <li>Building a 12–18 credit schedule around your completed courses</li>
                <li>Watching seat counts on every section you care about</li>
                <li>Flagging prerequisite conflicts before they bite you</li>
              </ul>
            </div>
            <a href="https://registerbuddy.com/schedule"
               style="display:block;background:#C3262A;color:white;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:15px">
              Open my schedule →
            </a>
            <p style="font-size:11px;color:#9ca3af;text-align:center;margin:16px 0 0">
              You're getting this because you signed up at RegisterBuddy.<br>
              <a href="#" style="color:#9ca3af">Unsubscribe</a>
            </p>
          </div>
        </div>
      `,
    })

    res.json({ ok: true })
  } catch (err) {
    console.error('[email/capture]', err.message)
    // Don't 500 — the frontend shouldn't see this as a failure
    res.json({ ok: true, warning: err.message })
  }
})

// ── POST /api/email/retention ─────────────────────────────────────────────────

router.post('/retention', async (req, res) => {
  try {
    const { email } = req.body
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Invalid email' })
    }

    console.log(`[Roger] Retention email triggered for: ${email}`)

    await sendEmail({
      to:      email,
      subject: '⏰ Your RegisterBuddy schedule is still saved — seats are filling',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">
          <div style="background:linear-gradient(135deg,#C3262A,#9b1c1c);padding:32px 24px;text-align:center;border-radius:12px 12px 0 0">
            <div style="font-size:48px;margin-bottom:8px">⏰</div>
            <h1 style="color:white;margin:0;font-size:20px">Don't lose your spot</h1>
            <p style="color:#fca5a5;margin:8px 0 0;font-size:14px">Registration is coming up fast</p>
          </div>
          <div style="background:white;padding:28px 24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px">
            <p style="font-size:15px;line-height:1.6;margin:0 0 16px">
              Hey — I noticed you left before finishing your schedule. The good news: <strong>everything is still saved</strong> and waiting for you.
            </p>
            <p style="font-size:14px;line-height:1.6;color:#4b5563;margin:0 0 20px">
              Seats in popular sections fill fast once registration opens. Come back and lock in your plan now — it takes less than 2 minutes.
            </p>
            <a href="https://registerbuddy.com/schedule"
               style="display:block;background:#C3262A;color:white;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:700;font-size:15px">
              ← Back to my schedule
            </a>
            <p style="font-size:11px;color:#9ca3af;text-align:center;margin:16px 0 0">
              — Roger, your RegisterBuddy advisor<br>
              <a href="#" style="color:#9ca3af">Unsubscribe</a>
            </p>
          </div>
        </div>
      `,
    })

    res.json({ ok: true })
  } catch (err) {
    console.error('[email/retention]', err.message)
    res.json({ ok: true, warning: err.message })
  }
})

module.exports = router
