/**
 * RogerAgent — AI academic advisor chat + SDR welcome
 *
 * - First visit: welcome modal (delayed 3 s) → email capture
 * - All visits:  FAB button (bottom-right) opens a real chat window
 * - Chat calls  POST /api/roger/chat with conversation history + student profile
 * - Roger can search the DB for real sections and propose schedule changes
 *   with Accept/Reject buttons inline in the chat
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import {
  getRogerState, setRogerState,
  loadProfile, loadPlan,
  loadSavedSchedule, saveSchedule,
} from '../lib/userProfile'
import { isSubscribed } from '../lib/subscription'
import PricingModal from './PricingModal'

// ── Suggested prompts ─────────────────────────────────────────────────────────

const SUGGESTIONS = [
  'What should I take next semester?',
  'Find me a section with no Fridays',
  'Swap my earliest class to afternoon',
  'How do I finish my Miami Plan?',
  'Am I on track to graduate?',
]

// ── Chat history persistence ──────────────────────────────────────────────────

const ROGER_CHAT_KEY = 'rb_roger_chat'

function loadChatHistory() {
  try {
    const raw = localStorage.getItem(ROGER_CHAT_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    // Strip schedule proposals from history so Accept buttons don't re-appear
    return data
      .filter(m => m && m.role && typeof m.content === 'string')
      .map(m => ({ ...m, scheduleProposal: null }))
  } catch {
    return []
  }
}

function saveChatHistory(messages) {
  try {
    // Persist last 120 messages; strip large proposal blobs to save space
    const toSave = messages.slice(-120).map(m => ({
      role:    m.role,
      content: m.content,
      ts:      m.ts || Date.now(),
    }))
    localStorage.setItem(ROGER_CHAT_KEY, JSON.stringify(toSave))
  } catch { /* localStorage full — silently skip */ }
}

function clearChatHistory() {
  try { localStorage.removeItem(ROGER_CHAT_KEY) } catch {}
}

// ── Date separator for chat history ──────────────────────────────────────────

function DateSeparator({ ts }) {
  const date      = new Date(ts)
  const today     = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  let label
  if (date.toDateString() === today.toDateString())          label = 'Today'
  else if (date.toDateString() === yesterday.toDateString()) label = 'Yesterday'
  else label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className="flex items-center gap-2 my-1">
      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
      <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">{label}</span>
      <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
    </div>
  )
}

// ── Roger chat API call ───────────────────────────────────────────────────────

async function askRoger(messages, profile) {
  const res = await fetch('/api/roger/chat', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, profile }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Roger is offline right now')
  }
  return res.json() // { content, scheduleProposal? }
}

// ── Apply a schedule proposal ─────────────────────────────────────────────────

function applyProposal(proposal) {
  const current = loadSavedSchedule()?.sections || []

  let next = [...current]

  if (proposal.action === 'add' && proposal.section) {
    // Don't double-add
    if (!next.find(s => s.crn === proposal.section.crn)) {
      next.push(proposal.section)
    }
  } else if (proposal.action === 'remove') {
    const crn = proposal.replace_crn || proposal.section?.crn
    if (crn) next = next.filter(s => String(s.crn) !== String(crn))
  } else if (proposal.action === 'swap') {
    const crn = proposal.replace_crn
    if (crn && proposal.section) {
      const idx = next.findIndex(s => String(s.crn) === String(crn))
      if (idx !== -1) {
        next[idx] = proposal.section
      } else {
        next.push(proposal.section)
      }
    }
  }

  saveSchedule(next)
  // Notify Schedule page (if open) via custom event
  window.dispatchEvent(new CustomEvent('scheduleUpdated', { detail: next }))
  return next
}

// ── Schedule proposal card ────────────────────────────────────────────────────

function ScheduleProposalCard({ proposal, onAccept, onDismiss }) {
  if (!proposal) return null

  const { action, section, replace_code, reason } = proposal
  const [accepted, setAccepted] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const actionLabel = {
    add:    '+ Add to schedule',
    remove: '− Remove from schedule',
    swap:   '↔ Swap section',
  }[action] || 'Update schedule'

  const handleAccept = () => {
    setAccepted(true)
    onAccept()
  }
  const handleDismiss = () => {
    setDismissed(true)
    onDismiss()
  }

  if (dismissed) return null

  return (
    <div className="mx-0.5 mt-1 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 overflow-hidden text-xs">
      {/* Header */}
      <div className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900/50 border-b border-blue-200 dark:border-blue-800 flex items-center gap-1.5">
        <span>🤖</span>
        <span className="font-bold text-blue-700 dark:text-blue-300">Roger suggests a change</span>
        <span className="ml-auto text-blue-400 dark:text-blue-500 font-medium">{actionLabel}</span>
      </div>

      <div className="px-3 py-2.5">
        {/* Section details */}
        {section && (
          <div className="mb-2 p-2 rounded-lg bg-white dark:bg-gray-800 border border-blue-100 dark:border-blue-900">
            <div className="font-bold text-gray-800 dark:text-gray-100">{section.code} — {section.name}</div>
            <div className="text-gray-500 dark:text-gray-400 mt-0.5">{section.schedule || 'TBA'} · {section.room || 'TBA'}</div>
            <div className="flex items-center gap-3 mt-1 text-gray-500 dark:text-gray-400">
              <span>👨‍🏫 {section.instructor || 'Staff'}{section.rmp_score ? ` · ⭐ ${section.rmp_score}` : ''}</span>
              <span className={section.seats_avail > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}>
                {section.seats_avail > 0 ? `${section.seats_avail} seats open` : 'Full'}
              </span>
            </div>
          </div>
        )}

        {/* Swap context */}
        {(action === 'swap' || action === 'remove') && replace_code && (
          <div className="mb-2 text-amber-700 dark:text-amber-400 flex items-center gap-1">
            <span>↓ replaces</span>
            <span className="font-bold">{replace_code}</span>
          </div>
        )}

        {/* Reason */}
        <p className="text-gray-600 dark:text-gray-300 mb-2.5 leading-relaxed">{reason}</p>

        {/* Buttons */}
        {accepted ? (
          <div className="text-center py-1 font-bold text-emerald-600 dark:text-emerald-400">
            ✓ Applied to your schedule
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleAccept}
              className="flex-1 py-1.5 rounded-lg font-bold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors active:scale-95"
            >
              ✓ Apply change
            </button>
            <button
              onClick={handleDismiss}
              className="flex-1 py-1.5 rounded-lg font-bold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              ✗ Dismiss
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Markdown-lite renderer for Roger's text ───────────────────────────────────
// Handles **bold**, bullet lists, and newlines without a full MD library

function RogerText({ text }) {
  if (!text) return null

  const lines = text.split('\n')
  const elements = []
  let listItems = []

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="list-none space-y-0.5 mt-1">
          {listItems.map((item, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-miami-red flex-shrink-0">•</span>
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      )
      listItems = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed) {
      flushList()
      continue
    }
    const isBullet = /^[-*•]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)
    if (isBullet) {
      listItems.push(trimmed.replace(/^[-*•]\s+/, '').replace(/^\d+\.\s+/, ''))
    } else {
      flushList()
      elements.push(<p key={i} className="leading-relaxed">{renderInline(trimmed)}</p>)
    }
  }
  flushList()

  return <div className="space-y-1">{elements}</div>
}

function renderInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

// ── Chat bubble ───────────────────────────────────────────────────────────────

function Bubble({ role, text, scheduleProposal, onAcceptProposal, onDismissProposal }) {
  const isUser = role === 'user'
  return (
    <div className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="w-7 h-7 flex-shrink-0 rounded-full bg-miami-red flex items-center justify-center text-white text-xs font-black shadow-sm">
          R
        </div>
      )}
      <div className="max-w-[82%] flex flex-col gap-1.5">
        <div className={`px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed shadow-sm ${
          isUser
            ? 'bg-miami-red text-white rounded-tr-none'
            : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-800 dark:text-gray-200 rounded-tl-none'
        }`}>
          {isUser ? text : <RogerText text={text} />}
        </div>
        {/* Schedule proposal card — only on Roger's messages */}
        {!isUser && scheduleProposal && (
          <ScheduleProposalCard
            proposal={scheduleProposal}
            onAccept={() => onAcceptProposal?.(scheduleProposal)}
            onDismiss={onDismissProposal}
          />
        )}
      </div>
    </div>
  )
}

// ── Chat panel ────────────────────────────────────────────────────────────────

function ChatPanel({ onClose, profile, subscribed, onUpgrade }) {
  const [messages, setMessages] = useState(() => loadChatHistory())
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  const handleClearHistory = useCallback(() => {
    setMessages([])
    clearChatHistory()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  const handleAcceptProposal = useCallback((proposal) => {
    applyProposal(proposal)
  }, [])

  const send = useCallback(async (text) => {
    const userText = (text || input).trim()
    if (!userText || loading) return
    setInput('')
    setError(null)

    const userMsg    = { role: 'user', content: userText, ts: Date.now() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    saveChatHistory(newMessages)
    setLoading(true)

    try {
      const data = await askRoger(newMessages, profile)
      setMessages(prev => {
        const next = [...prev, {
          role:             'assistant',
          content:          data.content,
          scheduleProposal: data.scheduleProposal || null,
          ts:               Date.now(),
        }]
        saveChatHistory(next)
        return next
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [input, messages, loading, profile])

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  if (!subscribed) {
    return (
      <div className="fixed bottom-0 right-5 sm:bottom-5 z-[60] flex flex-col w-[22rem] max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="flex items-center justify-between bg-miami-red px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center text-lg">🎓</div>
            <div>
              <p className="text-white font-bold text-sm leading-tight">Roger</p>
              <p className="text-red-200 text-xs">AI schedule advisor</p>
            </div>
          </div>
          <button onClick={onClose} className="text-red-200 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="p-5 text-center">
          <p className="text-3xl mb-3">🤖</p>
          <h3 className="font-extrabold text-gray-900 dark:text-gray-100 text-sm mb-2">Roger AI chat is a premium feature</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed mb-4">
            Ask me anything — I can find sections with no Fridays, swap your 8am, check what fills your Miami Plan, and more.
          </p>
          <button
            onClick={onUpgrade}
            className="w-full py-3 bg-miami-red text-white text-xs font-extrabold rounded-xl hover:bg-miami-red-dark transition-colors"
          >
            🔓 Unlock Roger — $10/semester →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed bottom-0 right-5 sm:bottom-5 z-[60] flex flex-col w-[22rem] max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden"
      style={{ height: '32rem' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between bg-miami-red px-4 py-3 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center text-lg shadow-sm">🎓</div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">Roger</p>
            <p className="text-red-200 text-xs leading-tight">AI schedule advisor</p>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-3">
          {messages.length > 0 && (
            <button
              onClick={handleClearHistory}
              className="text-red-300 hover:text-white text-[10px] font-semibold transition-colors border border-red-400/40 hover:border-white/40 rounded-lg px-2 py-1 leading-none"
              title="Clear chat history"
            >
              Clear
            </button>
          )}
          <button onClick={onClose} className="text-red-200 hover:text-white text-xl leading-none transition-colors" aria-label="Close chat">×</button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/60 dark:bg-gray-800/40">
        {/* Welcome message */}
        <Bubble
          role="assistant"
          text={`Hey${profile?.name ? ` ${profile.name.split(' ')[0]}` : ''}! I'm Roger 🎓 ${profile?.major ? `I see you're studying ${profile.major}${profile.minor ? ` with a ${profile.minor} minor` : ''}. ` : ''}I can answer questions, find specific sections, and update your schedule directly — just ask!`}
        />

        {/* Suggestions */}
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => send(s)}
                disabled={loading}
                className="text-xs px-2.5 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-600 dark:text-gray-400 hover:border-miami-red hover:text-miami-red dark:hover:text-red-400 transition-colors leading-tight text-left"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Conversation — with date separators between days */}
        {messages.reduce((acc, m, i) => {
          // Inject a date separator when the day changes
          if (m.ts) {
            const thisDay = new Date(m.ts).toDateString()
            const prevTs  = messages[i - 1]?.ts
            const prevDay = prevTs ? new Date(prevTs).toDateString() : null
            if (!prevDay || prevDay !== thisDay) {
              acc.push(<DateSeparator key={`sep-${i}`} ts={m.ts} />)
            }
          }
          acc.push(
            <Bubble
              key={i}
              role={m.role}
              text={m.content}
              scheduleProposal={m.scheduleProposal}
              onAcceptProposal={handleAcceptProposal}
              onDismissProposal={() => {
                setMessages(prev => prev.map((msg, idx) =>
                  idx === i ? { ...msg, scheduleProposal: null } : msg
                ))
              }}
            />
          )
          return acc
        }, [])}

        {/* Thinking indicator */}
        {loading && (
          <div className="flex gap-2.5 justify-start">
            <div className="w-7 h-7 flex-shrink-0 rounded-full bg-miami-red flex items-center justify-center text-white text-xs font-black">R</div>
            <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl rounded-tl-none px-3.5 py-2.5 shadow-sm">
              <span className="flex gap-1 items-center h-4">
                <span className="w-1.5 h-1.5 bg-gray-300 dark:bg-gray-500 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-gray-300 dark:bg-gray-500 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-gray-300 dark:bg-gray-500 rounded-full animate-bounce [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-xs text-red-500 text-center bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 rounded-xl px-3 py-2">
            {error} — <button className="underline" onClick={() => { setError(null); send(messages.at(-1)?.content) }}>retry</button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-100 dark:border-gray-800 p-3 bg-white dark:bg-gray-900 flex-shrink-0">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            className="flex-1 pl-3 pr-2 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs focus:outline-none focus:ring-2 focus:ring-miami-red/20 focus:border-miami-red placeholder-gray-300 dark:placeholder-gray-600"
            placeholder="Ask about sections, prereqs, requirements…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={loading}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-colors ${
              input.trim() && !loading
                ? 'bg-miami-red text-white hover:bg-miami-red-dark'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600 cursor-not-allowed'
            }`}
          >
            →
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Welcome modal (first-visit) ───────────────────────────────────────────────

function EmailForm({ onSubmit, loading }) {
  const [email, setEmail] = useState('')
  const inputRef = useRef(null)

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 150) }, [])

  const submit = (e) => {
    e.preventDefault()
    if (!email.includes('@')) return
    onSubmit(email)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <input
        ref={inputRef}
        type="email"
        required
        placeholder="your@miamioh.edu"
        value={email}
        onChange={e => setEmail(e.target.value)}
        className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-miami-red/30 focus:border-miami-red placeholder-gray-300 dark:placeholder-gray-500"
      />
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 rounded-xl text-sm font-bold bg-miami-red text-white hover:bg-miami-red-dark transition-colors disabled:opacity-60 active:scale-[0.98]"
      >
        {loading ? 'Saving…' : "Let's go →"}
      </button>
    </form>
  )
}

function WelcomeModal({ onClose, onEmailSubmit, onStartChat }) {
  const [phase, setPhase] = useState('greeting')
  const [loading, setLoading] = useState(false)

  const handleEmail = useCallback(async (email) => {
    setLoading(true)
    try {
      await fetch('/api/email/capture', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, source: 'roger_welcome' }),
      })
    } catch { /* backend offline — still save locally */ }
    setLoading(false)
    onEmailSubmit(email)
    setPhase('done')
  }, [onEmailSubmit])

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-br from-miami-red to-red-800 px-6 pt-6 pb-8 text-center relative">
          <button onClick={onClose} className="absolute top-3 right-4 text-red-300 hover:text-white text-xl leading-none" aria-label="Close">×</button>
          <div className="w-20 h-20 rounded-full bg-white/20 border-4 border-white/40 mx-auto mb-4 flex items-center justify-center text-4xl shadow-lg">🎓</div>
          {phase === 'greeting' && (
            <>
              <h2 className="text-white font-extrabold text-xl mb-1 leading-tight">Hi! I'm Roger.</h2>
              <p className="text-red-200 text-sm leading-relaxed">Your AI academic advisor at RegisterBuddy. I build schedules, find sections, and answer anything about your requirements.</p>
            </>
          )}
          {phase === 'email' && (
            <>
              <h2 className="text-white font-extrabold text-lg mb-1">One quick thing</h2>
              <p className="text-red-200 text-sm leading-relaxed">Drop your email so I can send seat alerts and your saved schedule before registration opens.</p>
            </>
          )}
          {phase === 'done' && (
            <>
              <h2 className="text-white font-extrabold text-xl mb-1">You're all set! 🎉</h2>
              <p className="text-red-200 text-sm">Ask me to find sections, swap classes, or check your requirements.</p>
            </>
          )}
        </div>
        <div className="p-5">
          {phase === 'greeting' && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-950/40 rounded-xl">
                <span className="text-lg mt-0.5">🔍</span>
                <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">Tell me "no Fridays" or "afternoon only" and I'll find real sections that work — then update your schedule automatically.</p>
              </div>
              <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl">
                <span className="text-lg mt-0.5">📋</span>
                <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">I'll build you a conflict-free schedule that fills your Miami Plan <em>and</em> major requirements — automatically.</p>
              </div>
              <button onClick={() => setPhase('email')} className="w-full py-3 rounded-xl text-sm font-bold bg-miami-red text-white hover:bg-miami-red-dark transition-colors active:scale-[0.98] mt-2">
                Get started →
              </button>
              <button onClick={() => { onClose(); onStartChat() }} className="w-full text-xs text-miami-red hover:text-red-700 py-1.5 transition-colors font-semibold">
                Skip — just open chat
              </button>
            </div>
          )}
          {phase === 'email' && <EmailForm onSubmit={handleEmail} loading={loading} />}
          {phase === 'done' && (
            <button
              onClick={() => { onClose(); onStartChat() }}
              className="w-full py-3 rounded-xl text-sm font-bold bg-miami-red text-white hover:bg-miami-red-dark transition-colors"
            >
              Chat with Roger →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Roger component (mounted at app root) ─────────────────────────────────

export default function RogerAgent() {
  const location   = useLocation()
  const rogerState = getRogerState()

  const [showWelcome,   setShowWelcome]   = useState(false)
  const [showChat,      setShowChat]      = useState(false)
  const [showPricing,   setShowPricing]   = useState(false)
  const [subscribed,    setSubscribed]    = useState(() => isSubscribed())
  const capturedEmail = rogerState.email

  // Build profile including current schedule for Roger's context
  const profile = (() => {
    const p        = loadProfile()
    const plan     = loadPlan()
    const saved    = loadSavedSchedule()
    const schedule = saved?.sections || []
    return { ...p, plan, schedule }
  })()

  // Show welcome modal after 3 s on first visit (not during onboarding)
  useEffect(() => {
    if (location.pathname === '/onboarding') return
    if (rogerState.shown) return
    const t = setTimeout(() => {
      setShowWelcome(true)
      setRogerState({ shown: true })
    }, 3000)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  const handleEmailCapture = useCallback((email) => {
    setRogerState({ email, convertedAt: Date.now() })
  }, [])

  const openChat     = useCallback(() => { setShowWelcome(false); setShowChat(true) }, [])
  const closeChat    = useCallback(() => setShowChat(false), [])
  const closeWelcome = useCallback(() => setShowWelcome(false), [])

  return (
    <>
      {/* Roger FAB */}
      {!showChat && !showWelcome && !showPricing && (
        <button
          onClick={() => setShowChat(true)}
          className="fixed bottom-6 right-5 z-50 flex items-center gap-2.5 bg-miami-red text-white pl-4 pr-5 py-3 rounded-2xl shadow-xl shadow-miami-red/30 hover:bg-miami-red-dark transition-all hover:scale-[1.03] active:scale-[0.97]"
          aria-label="Chat with Roger"
        >
          <span className="text-xl">🎓</span>
          <div className="text-left">
            <p className="text-xs font-bold leading-tight">Roger</p>
            <p className="text-[11px] text-red-200 leading-tight">{subscribed ? 'AI advisor' : 'Ask me anything'}</p>
          </div>
          {!rogerState.shown && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full border-2 border-white animate-pulse" />
          )}
        </button>
      )}

      {showChat && (
        <ChatPanel
          onClose={closeChat}
          profile={profile}
          subscribed={subscribed}
          onUpgrade={() => { setShowChat(false); setShowPricing(true) }}
        />
      )}

      {showWelcome && (
        <WelcomeModal
          onClose={closeWelcome}
          onEmailSubmit={handleEmailCapture}
          onStartChat={openChat}
        />
      )}

      {showPricing && (
        <PricingModal
          onClose={() => setShowPricing(false)}
          onSuccess={() => { setSubscribed(true); setShowPricing(false); setShowChat(true) }}
          highlightFeature="Roger AI chat"
          email={capturedEmail || ''}
        />
      )}
    </>
  )
}
