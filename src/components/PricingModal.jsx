/**
 * PricingModal — the paywall / upgrade modal
 *
 * Props:
 *   onClose()          — called when the user dismisses
 *   onSuccess(plan)    — called after successful activation
 *   email              — pre-fill from Roger capture (optional)
 *   highlightFeature   — string shown in the "you tried to access" context line
 */

import { useState } from 'react'
import { PLANS, startCheckout } from '../lib/subscription'

const FEATURES = [
  { icon: '🎯', text: 'All 20 personalized course picks (not just 3)' },
  { icon: '📅', text: 'AI schedule builder — Roger auto-builds a conflict-free schedule' },
  { icon: '🤖', text: 'Roger AI advisor — ask anything about your requirements' },
  { icon: '🔔', text: 'Seat availability alerts when sections fill up' },
  { icon: '📊', text: 'Requirement gap tracker — Miami Plan + major + minor' },
  { icon: '📆', text: 'Multi-semester planning roadmap' },
]

const TESTIMONIALS = [
  { text: '"Saved me from missing a prereq I had no idea about."', name: 'CS Junior' },
  { text: '"Roger built my whole schedule automatically — no conflicts, right requirements. Unreal."', name: 'Marketing Sophomore' },
  { text: '"$10 for my whole registration? Less than one dining swipe."', name: 'Bio Freshman' },
]

export default function PricingModal({ onClose, onSuccess, email = '', highlightFeature = null }) {
  const [selectedPlan, setSelectedPlan] = useState('annual')
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState(null)
  const [testimonialIdx]                = useState(() => Math.floor(Math.random() * TESTIMONIALS.length))

  const handleCheckout = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await startCheckout(selectedPlan, email)
      if (result.devMode) {
        // Dev mode — subscription already saved, notify parent
        onSuccess?.(selectedPlan)
        onClose?.()
      }
      // If redirecting, page will navigate away — no need to do anything
    } catch (err) {
      setError(err.message || 'Something went wrong. Try again.')
      setLoading(false)
    }
  }

  const plan = PLANS[selectedPlan]

  return (
    <div
      className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="relative bg-gradient-to-br from-miami-red to-red-900 px-6 pt-6 pb-10 text-center">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors text-lg leading-none"
            aria-label="Close"
          >×</button>

          <div className="inline-flex items-center gap-1.5 bg-amber-400/90 text-amber-900 text-xs font-black px-3 py-1 rounded-full mb-3 uppercase tracking-wide">
            🔓 Unlock RegisterBuddy
          </div>
          <h2 className="text-white font-extrabold text-xl sm:text-2xl mb-1.5 leading-tight">
            Never miss a required course again
          </h2>
          {highlightFeature && (
            <p className="text-red-200 text-sm">
              You need access to <span className="text-white font-semibold">{highlightFeature}</span> — unlock it below.
            </p>
          )}
          {!highlightFeature && (
            <p className="text-red-200 text-sm leading-relaxed">
              {TESTIMONIALS[testimonialIdx].text}
              <span className="block text-red-300 text-xs mt-1">— {TESTIMONIALS[testimonialIdx].name}</span>
            </p>
          )}
        </div>

        {/* ── Plan selector (overlaps header) ── */}
        <div className="px-6 -mt-6">
          <div className="grid grid-cols-2 gap-3">
            {Object.values(PLANS).map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedPlan(p.id)}
                className={`relative rounded-2xl border-2 p-4 text-left transition-all ${
                  selectedPlan === p.id
                    ? 'border-miami-red bg-red-50 dark:bg-red-950/40 shadow-lg shadow-miami-red/10'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                {p.badge && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-amber-400 text-amber-900 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap">
                    {p.badge}
                  </span>
                )}
                <div className={`text-xs font-bold mb-0.5 ${selectedPlan === p.id ? 'text-miami-red' : 'text-gray-500 dark:text-gray-400'}`}>
                  {p.label}
                </div>
                <div className={`font-extrabold text-2xl leading-none mb-0.5 ${selectedPlan === p.id ? 'text-gray-900 dark:text-gray-100' : 'text-gray-800 dark:text-gray-200'}`}>
                  ${p.price}
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500">{p.desc}</div>
                {selectedPlan === p.id && (
                  <div className="absolute top-3 right-3 w-5 h-5 bg-miami-red rounded-full flex items-center justify-center">
                    <span className="text-white text-xs leading-none font-bold">✓</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Features ── */}
        <div className="px-6 pt-4 pb-2">
          <ul className="space-y-2">
            {FEATURES.map(f => (
              <li key={f.text} className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-300">
                <span className="flex-shrink-0 mt-0.5">{f.icon}</span>
                <span className="leading-snug">{f.text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* ── CTA ── */}
        <div className="px-6 pb-6 pt-3 space-y-2.5">
          {error && (
            <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl px-3 py-2 text-center">
              {error}
            </div>
          )}

          <button
            onClick={handleCheckout}
            disabled={loading}
            className="w-full py-4 rounded-xl text-sm font-extrabold bg-miami-red text-white hover:bg-miami-red-dark disabled:opacity-60 transition-colors shadow-lg shadow-miami-red/25 active:scale-[0.98]"
          >
            {loading
              ? 'Activating…'
              : `Unlock ${plan.label} — $${plan.price} →`}
          </button>

          <p className="text-xs text-gray-400 dark:text-gray-500 text-center leading-relaxed">
            One-time charge · No subscription · Secure checkout
            <br />Less than a single <span className="font-semibold">$30 late add/drop fee</span>
          </p>

          <button
            onClick={onClose}
            className="w-full text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 py-1 transition-colors"
          >
            Not now — keep browsing free picks
          </button>
        </div>
      </div>
    </div>
  )
}
