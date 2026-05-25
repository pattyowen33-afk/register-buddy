import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getRequirements, buildAISchedule } from '../api'
import { loadProfile, saveProfile, loadSavedSchedule, saveSchedule, loadPlan } from '../lib/userProfile'
import { isSubscribed } from '../lib/subscription'
import PricingModal from '../components/PricingModal'
import {
  buildSchedule, parseDays, getCalendarStyle,
  CALENDAR_TOTAL_HEIGHT, getColor, conflictsWithBasket,
  hasConflict, getRequirementLabels,
} from '../lib/scheduleBuilder'

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_CREDITS = 12
const MAX_CREDITS = 18
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const DAY_KEYS = ['M', 'T', 'W', 'R', 'F']

// Time labels 7am–9pm every hour
const TIME_LABELS = Array.from({ length: 15 }, (_, i) => {
  const h = i + 7
  return { label: h === 12 ? '12pm' : h > 12 ? `${h - 12}pm` : `${h}am`, minutes: h * 60 }
})
const CALENDAR_START_MIN = 7 * 60
const PX_PER_MIN = 1.4

// ── Helpers ───────────────────────────────────────────────────────────────────

function totalCredits(sections) {
  return sections.reduce((sum, s) => sum + (Number(s.credits) || 3), 0)
}

function fmt12(t24) {
  if (!t24) return ''
  const [h, m] = t24.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(m).padStart(2, '0')}${ampm}`
}

function creditColor(credits) {
  if (credits < MIN_CREDITS) return 'text-amber-600'
  if (credits > MAX_CREDITS) return 'text-red-600'
  return 'text-emerald-600'
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Single course block rendered inside the calendar grid */
function CalendarBlock({ section, dayIndex, onRemove, onSelect, isSelected }) {
  const style   = getCalendarStyle(section)
  if (!style) return null
  const color   = getColor(section)
  const primary = section.fulfills?.[0]?.label ?? 'Elective'

  return (
    <div
      className={`absolute left-0.5 right-0.5 rounded-md border-l-4 px-1.5 py-0.5 cursor-pointer
        select-none overflow-hidden shadow-sm transition-all
        ${color.bg} ${color.border} ${color.text}
        ${isSelected ? 'ring-2 ring-offset-1 ring-gray-700 z-20' : 'z-10 hover:z-20 hover:shadow-md'}`}
      style={{ ...style, position: 'absolute' }}
      onClick={() => onSelect(section)}
    >
      <div className="font-bold text-xs leading-tight truncate">{section.code}</div>
      <div className="text-xs leading-tight truncate opacity-80">{section.section}</div>
      {Number(style.height) > 40 && (
        <div className="text-xs leading-tight truncate opacity-70">{section.room}</div>
      )}
    </div>
  )
}

/** Weekly calendar grid */
function WeeklyCalendar({ sections, onRemove, selectedSection, onSelect }) {
  return (
    <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-950">
      {/* Day headers */}
      <div className="sticky top-0 z-30 grid bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800" style={{ gridTemplateColumns: '52px repeat(5, 1fr)' }}>
        <div className="py-2" />
        {DAYS.map(d => (
          <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 border-l border-gray-100 dark:border-gray-800">{d}</div>
        ))}
      </div>

      {/* Grid body */}
      <div className="relative grid" style={{ gridTemplateColumns: '52px repeat(5, 1fr)', height: `${CALENDAR_TOTAL_HEIGHT}px` }}>
        {/* Time labels */}
        <div className="relative col-span-1">
          {TIME_LABELS.map(({ label, minutes }) => (
            <div
              key={label}
              className="absolute right-1 text-xs text-gray-400 dark:text-gray-600 -translate-y-2.5"
              style={{ top: `${(minutes - CALENDAR_START_MIN) * PX_PER_MIN}px` }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {DAY_KEYS.map((dayKey, di) => {
          const daySections = sections.filter(s => parseDays(s.days).includes(di + 1))
          return (
            <div key={dayKey} className="relative border-l border-gray-100 dark:border-gray-800">
              {/* Hour lines */}
              {TIME_LABELS.map(({ minutes }) => (
                <div
                  key={minutes}
                  className="absolute w-full border-t border-gray-100 dark:border-gray-800"
                  style={{ top: `${(minutes - CALENDAR_START_MIN) * PX_PER_MIN}px` }}
                />
              ))}
              {/* Course blocks */}
              {daySections.map(s => (
                <CalendarBlock
                  key={`${s.crn}-${dayKey}`}
                  section={s}
                  dayIndex={di}
                  onRemove={onRemove}
                  onSelect={onSelect}
                  isSelected={selectedSection?.crn === s.crn}
                />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Left sidebar — Miami Plan + Major requirement tracker */
function RequirementsSidebar({ gapData, sections }) {
  if (!gapData) return (
    <div className="w-60 border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
      <div className="text-sm text-gray-400 dark:text-gray-500">Loading…</div>
    </div>
  )

  const scheduledCodes = new Set(sections.map(s => s.code?.toUpperCase()))

  function categoryStatus(cat) {
    if (cat.satisfied) return 'done'
    // Check if any qualifying course is in the current schedule
    const inSchedule = (cat.courses || []).some(c => scheduledCodes.has(c?.toUpperCase()))
    if (inSchedule) return 'scheduled'
    return 'open'
  }

  const statusBadge = {
    done:      <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 font-medium flex-shrink-0">✓ Done</span>,
    scheduled: <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 font-medium flex-shrink-0">● Scheduled</span>,
    open:      <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-medium flex-shrink-0">○ Open</span>,
  }

  const mpDone  = gapData.miamiPlan?.summary?.satisfiedCount ?? 0
  const mpTotal = gapData.miamiPlan?.summary?.totalCount ?? 0
  const majDone  = gapData.major?.core?.completed ?? 0
  const majTotal = gapData.major?.core?.total ?? 0

  return (
    <div className="w-60 flex-shrink-0 border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 overflow-y-auto">
      <div className="sticky top-0 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-3 py-2 z-10">
        <div className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Requirements</div>
        <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
          Miami Plan {mpDone}/{mpTotal} · Major {majDone}/{majTotal}
        </div>
      </div>

      {/* Miami Plan */}
      <div className="px-3 pt-3 pb-1">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Miami Plan</span>
          <span className="text-xs text-gray-400 dark:text-gray-500">{mpDone}/{mpTotal}</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mb-2">
          <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${mpTotal ? (mpDone / mpTotal) * 100 : 0}%` }} />
        </div>
        <div className="space-y-1.5">
          {gapData.miamiPlan?.categories?.map(cat => {
            const status = categoryStatus(cat)
            // Course from the current schedule that satisfies this category
            const scheduledFill = sections.find(s =>
              (cat.courses || []).some(c => c?.toUpperCase() === s.code?.toUpperCase())
            )
            // Courses the student already completed that satisfy this category
            const completedFills = cat.satisfyingCompleted || []

            return (
              <div
                key={cat.id}
                className={`rounded-lg p-2 border ${
                  status === 'done'
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                    : status === 'scheduled'
                    ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="text-xs text-gray-700 dark:text-gray-300 leading-snug flex-1">{cat.label}</div>
                  {statusBadge[status]}
                </div>

                {/* Completed courses that satisfy this area */}
                {completedFills.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {completedFills.map(code => (
                      <span key={code} className="text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 rounded px-1.5 py-0.5 font-medium">
                        ✓ {code}
                      </span>
                    ))}
                  </div>
                )}

                {/* Scheduled course filling this area */}
                {status === 'scheduled' && scheduledFill && completedFills.length === 0 && (
                  <div className="mt-1 text-xs text-blue-700 dark:text-blue-400 font-medium">
                    ● {scheduledFill.code}
                  </div>
                )}

                {/* Credits needed if open */}
                {status === 'open' && cat.requiredCredits && (
                  <div className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                    {cat.requiredCredits} cr needed
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Major Core */}
      <div className="px-3 pt-3 pb-4 border-t border-gray-200 dark:border-gray-800 mt-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Major Core</span>
          <span className="text-xs text-gray-400 dark:text-gray-500">{majDone}/{majTotal}</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mb-2">
          <div className="bg-red-400 h-1.5 rounded-full transition-all" style={{ width: `${majTotal ? (majDone / majTotal) * 100 : 0}%` }} />
        </div>
        <div className="space-y-1.5">
          {gapData.major?.core?.courses?.slice(0, 12).map(c => {
            const inSchedule = scheduledCodes.has(c.code?.toUpperCase())
            const status = c.completed ? 'done' : inSchedule ? 'scheduled' : c.prereqsMet ? 'ready' : 'blocked'
            return (
              <div
                key={c.code}
                className={`rounded-lg p-2 border ${
                  status === 'done'      ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' :
                  status === 'scheduled' ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' :
                  status === 'ready'     ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700' :
                  'bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-700 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{c.code}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${
                    status === 'done'      ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400' :
                    status === 'scheduled' ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400' :
                    status === 'ready'     ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400' :
                    'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                  }`}>
                    {status === 'done' ? '✓ Done' : status === 'scheduled' ? '● Sched.' : status === 'ready' ? 'Yr ' + c.year : '🔒'}
                  </span>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate leading-tight mt-0.5">{c.name}</div>
                {c.credits && <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{c.credits} cr{status === 'blocked' && c.prereqs?.length ? ` · needs ${c.prereqs.join(', ')}` : ''}</div>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Right sidebar — course list + controls */
function ScheduleSidebar({ sections, gapData, onAdd, onRemove, onSwap, onAutoFill, onClear, loading }) {
  const credits = totalCredits(sections)
  const pct = Math.min(100, Math.max(0, ((credits - MIN_CREDITS) / (MAX_CREDITS - MIN_CREDITS)) * 100))

  return (
    <div className="w-72 flex-shrink-0 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col overflow-hidden">
      {/* Credit header */}
      <div className={`px-4 py-3 border-b border-gray-200 dark:border-gray-800 ${credits < MIN_CREDITS ? 'bg-amber-50 dark:bg-amber-950/30' : credits > MAX_CREDITS ? 'bg-red-50 dark:bg-red-950/30' : 'bg-emerald-50 dark:bg-emerald-950/30'}`}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Credit Hours</span>
          <span className={`text-xl font-bold ${creditColor(credits)}`}>{credits}</span>
        </div>
        <div className="mt-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 relative">
          <div className="absolute left-0 h-full bg-gray-300 dark:bg-gray-600 rounded-full" style={{ width: `${(MIN_CREDITS / MAX_CREDITS) * 100}%` }} />
          <div
            className={`h-2 rounded-full transition-all ${credits < MIN_CREDITS ? 'bg-amber-400' : credits > MAX_CREDITS ? 'bg-red-500' : 'bg-emerald-500'}`}
            style={{ width: `${(credits / MAX_CREDITS) * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-0.5">
          <span>{MIN_CREDITS} min</span>
          <span>{credits < MIN_CREDITS ? `Need ${MIN_CREDITS - credits} more` : credits > MAX_CREDITS ? `${credits - MAX_CREDITS} over max` : 'On track ✓'}</span>
          <span>{MAX_CREDITS} max</span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 flex gap-2">
        <button
          onClick={onAutoFill}
          disabled={loading}
          className="flex-1 bg-miami-red hover:bg-miami-red-dark disabled:opacity-50 text-white text-xs font-bold py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5"
        >
          {loading
            ? <><span className="animate-spin inline-block w-3 h-3 border border-white/40 border-t-white rounded-full" /> Building…</>
            : <><span>🤖</span> AI Build My Schedule</>}
        </button>
        <button
          onClick={onClear}
          className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 border border-gray-200 dark:border-gray-700 hover:border-red-200 dark:hover:border-red-800 rounded-lg transition-colors"
        >
          Clear
        </button>
      </div>

      {/* Course list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {sections.length === 0 && !loading && (
          <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
            <div className="text-2xl mb-2">🤖</div>
            <div>Click <strong>AI Build My Schedule</strong> and Roger will build a complete schedule for you</div>
          </div>
        )}
        {sections.length === 0 && loading && (
          <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
            <div className="text-2xl mb-3 animate-pulse">🤖</div>
            <div className="font-medium">Roger is building your schedule…</div>
            <div className="text-xs mt-1 opacity-60">Analyzing your requirements and picking the best courses</div>
          </div>
        )}
        {sections.map(s => {
          const color = getColor(s)
          return (
            <div key={s.crn} className={`rounded-xl border-l-4 p-3 ${color.bg} ${color.border} relative group`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className={`font-bold text-sm ${color.text}`}>{s.code}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 leading-snug truncate">{s.name}</div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onSwap(s)}
                    className="text-xs px-1.5 py-0.5 rounded bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-gray-600 dark:text-gray-400 hover:text-blue-700 dark:hover:text-blue-400"
                    title="Swap section"
                  >↔</button>
                  <button
                    onClick={() => onRemove(s.crn)}
                    className="text-xs px-1.5 py-0.5 rounded bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-red-50 dark:hover:bg-red-950/40 text-gray-600 dark:text-gray-400 hover:text-red-700 dark:hover:text-red-400"
                    title="Remove"
                  >✕</button>
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                <span className="text-xs bg-white/70 dark:bg-black/30 rounded px-1.5 py-0.5 text-gray-600 dark:text-gray-400">{s.schedule || 'Online'}</span>
                <span className="text-xs bg-white/70 dark:bg-black/30 rounded px-1.5 py-0.5 text-gray-600 dark:text-gray-400">{Number(s.credits) || 3} cr</span>
                {s.seats_avail !== undefined && (
                  <span className={`text-xs rounded px-1.5 py-0.5 ${Number(s.seats_avail) > 0 ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'}`}>
                    {Number(s.seats_avail) > 0 ? `${s.seats_avail} seats` : 'Full'}
                  </span>
                )}
              </div>
              {s.fulfills?.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {s.fulfills.map(f => (
                    <span key={f.id} className={`text-xs rounded-full px-2 py-0.5 text-white font-medium ${color.badge}`}>
                      {f.label.length > 24 ? f.label.slice(0, 22) + '…' : f.label}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">CRN {s.crn} · {s.room || 'TBA'}</div>
            </div>
          )
        })}
      </div>

      {/* Total credits footer */}
      {sections.length > 0 && (
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 text-sm">
          <div className="flex justify-between text-gray-600 dark:text-gray-400">
            <span>{sections.length} courses</span>
            <span className={`font-bold ${creditColor(credits)}`}>{credits} credit hours</span>
          </div>
        </div>
      )}
    </div>
  )
}

/** Section swap modal */
function SwapModal({ section, gapData, currentSchedule, onConfirm, onClose }) {
  const [alternates, setAlternates] = useState([])

  useEffect(() => {
    if (!section || !gapData) return
    // Find all sections with the same course code
    const alts = []
    const allSections = [
      ...(gapData.miamiPlan?.categories?.flatMap(c => c.closingSections || []) || []),
      ...(gapData.major?.core?.courses?.flatMap(c => c.openSections || []) || []),
      ...(gapData.major?.electiveGroups?.flatMap(g => g.closingSections || []) || []),
    ]
    for (const s of allSections) {
      if (s.code === section.code && s.crn !== section.crn) {
        // Check it doesn't conflict with rest of schedule
        const rest = currentSchedule.filter(x => x.crn !== section.crn)
        if (!conflictsWithBasket(s, rest)) {
          alts.push(s)
        }
      }
    }
    setAlternates([...new Map(alts.map(s => [s.crn, s])).values()])
  }, [section, gapData, currentSchedule])

  if (!section) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <div>
            <div className="font-bold text-gray-900 dark:text-gray-100">Swap Section — {section.code}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Current: Section {section.section} · {section.schedule}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl">✕</button>
        </div>
        <div className="p-5 max-h-80 overflow-y-auto space-y-2">
          {alternates.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No other sections available without conflicts.</div>
          ) : alternates.map(alt => (
            <button
              key={alt.crn}
              onClick={() => { onConfirm(section, alt); onClose() }}
              className="w-full text-left p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-red-300 dark:hover:border-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            >
              <div className="font-semibold text-sm text-gray-800 dark:text-gray-200">Section {alt.section}</div>
              <div className="text-xs text-gray-600 dark:text-gray-400">{alt.schedule}</div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">CRN {alt.crn} · {alt.seats_avail ?? alt.seatsAvail} seats · {alt.room}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main Schedule Page ─────────────────────────────────────────────────────────

export default function Schedule() {
  const navigate = useNavigate()
  const [profile, setProfile]         = useState(null)
  const [gapData, setGapData]         = useState(null)
  const [sections, setSections]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [gapLoading, setGapLoading]   = useState(false)
  const [aiBuildLoading, setAiBuildLoading] = useState(false)
  const [aiReasoning, setAiReasoning] = useState(null)
  const [selectedSection, setSelected]= useState(null)
  const [swapTarget, setSwapTarget]   = useState(null)
  const [warnings, setWarnings]       = useState([])
  const [toast, setToast]             = useState(null)
  const toastTimer = useRef(null)

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  // Convert a plan course object into a schedule section object
  function planCourseToSection(c, gd) {
    return {
      crn:         c.crn || `plan-${c.code}`,
      code:        c.code,
      name:        c.name,
      credits:     c.credits || 3,
      days:        c.days || '',
      schedule:    c.schedule || 'TBA',
      start_time:  c.start_time || '',
      end_time:    c.end_time || '',
      room:        c.room || '',
      instructor:  c.professor || c.instructor || 'Staff',
      seats_avail: c.seats ?? c.seats_avail ?? 0,
      seats_total: c.totalSeats ?? c.seats_total ?? 30,
      delivery:    c.delivery || 'in-person',
      fulfills:    gd ? getRequirementLabels(c, gd) : [],
    }
  }

  // Load profile and build initial schedule
  useEffect(() => {
    const p = loadProfile()
    if (!p?.major) {
      navigate('/onboarding')
      return
    }
    setProfile(p)

    // If user already has a saved schedule, restore it immediately
    const saved = loadSavedSchedule()
    if (saved?.sections?.length) {
      setSections(saved.sections)
      setLoading(false)
      // Still fetch gap data for requirement labels, but don't rebuild
      fetchGapData(p, /* autoFillIfEmpty= */ false)
      return
    }

    // No saved schedule — fetch gap data then let the AI build it
    fetchGapData(p, /* autoFillIfEmpty= */ true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Listen for Roger applying a schedule change from the chat panel
  useEffect(() => {
    const handler = (e) => {
      const newSections = e.detail
      if (!Array.isArray(newSections)) return
      setSections(newSections)
      showToast('✓ Roger updated your schedule!')
      // Re-enrich fulfillment labels if gap data is loaded
      if (gapData) {
        setSections(newSections.map(s => ({
          ...s,
          fulfills: s.fulfills?.length ? s.fulfills : getRequirementLabels(s, gapData),
        })))
      }
    }
    window.addEventListener('scheduleUpdated', handler)
    return () => window.removeEventListener('scheduleUpdated', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gapData])

  async function fetchGapData(p, autoFillIfEmpty = false) {
    setGapLoading(true)
    try {
      const data = await getRequirements(
        p.major,
        p.completedCourses || [],
        { planVersion: p.planVersion, year: p.year, minor: p.minor },
      )
      setGapData(data)

      if (autoFillIfEmpty) {
        // First visit — no saved schedule.
        // Check if the user already picked courses via the Results "My Plan" tray.
        const planCourses = loadPlan()
        const planWithTimes = planCourses.filter(c => c.crn && c.start_time)

        if (planWithTimes.length > 0) {
          // User hand-picked sections on Results — put them straight into the calendar
          const enriched = planWithTimes.map(c => ({
            ...planCourseToSection(c, data),
            fulfills: getRequirementLabels(c, data),
          }))
          setSections(enriched)
          saveSchedule(enriched)
          showToast(`Loaded ${enriched.length} courses from your plan!`)
        } else {
          // Let AI build the schedule from scratch
          await aiBuild(p)
        }
      } else {
        // Schedule already loaded — just re-enrich fulfillment labels
        setSections(prev => prev.map(s => ({
          ...s,
          fulfills: s.fulfills?.length ? s.fulfills : getRequirementLabels(s, data),
        })))
      }
    } catch (e) {
      console.error('Gap data error:', e)
      if (autoFillIfEmpty) {
        // Gap data failed — still try AI build with what we have
        await aiBuild(p)
      }
    } finally {
      setGapLoading(false)
      setLoading(false)
    }
  }

  // ── AI schedule builder — primary entry point ──────────────────────────────
  async function aiBuild(p) {
    const prof = p || profile
    if (!prof?.major) return
    setAiBuildLoading(true)
    setAiReasoning(null)
    try {
      const result = await buildAISchedule({
        major:            prof.major,
        minor:            prof.minor || '',
        completedCourses: prof.completedCourses || [],
        preferences: {
          year:      prof.year,
          credits:   prof.credits || 15,
          timePrefs: prof.timePrefs || [],
          avoidDays: prof.avoidDays || [],
          workload:  prof.workload || 'moderate',
        },
      })

      if (result.schedule?.length > 0) {
        // Enrich with fulfillment labels if we have gap data
        const enriched = result.schedule.map(s => ({
          ...s,
          fulfills: gapData ? getRequirementLabels(s, gapData) : [],
        }))
        setSections(enriched)
        saveSchedule(enriched)
        setAiReasoning(result.reasoning || null)
        if (result.warnings?.length) setWarnings(result.warnings)
        showToast(result.aiBuilt
          ? `AI built a ${result.totalCredits}-credit schedule for you!`
          : `Built a ${result.totalCredits}-credit schedule!`)
      } else if (result.dbEmpty) {
        showToast('No course data in DB yet — scraper needed.', 'info')
        setWarnings(['The course database is empty. Run the scraper or add courses from the Results page.'])
      } else {
        showToast('AI couldn\'t find a matching schedule — try adjusting preferences.', 'info')
      }
    } catch (err) {
      console.warn('[aiBuild]', err.message)
      // Fall back to local rule-based builder
      showToast('Using local schedule builder…', 'info')
      autoFill(gapData, prof.completedCourses)
    } finally {
      setAiBuildLoading(false)
    }
  }

  function autoFill(data, completed) {
    const gd = data || gapData
    const comp = completed || profile?.completedCourses || []
    if (!gd) {
      // No gap data yet — fall back to plan courses
      const planCourses = loadPlan()
      if (planCourses.length > 0) {
        const planSections = planCourses
          .filter(c => c.crn)
          .map(c => planCourseToSection(c, null))
        if (planSections.length > 0) {
          setSections(planSections)
          saveSchedule(planSections)
          showToast(`Loaded ${planSections.length} courses from your plan!`)
          return
        }
      }
      showToast('No schedule data yet. Add courses from Results first.', 'info')
      return
    }

    const result = buildSchedule(gd, comp, { target: 15, min: MIN_CREDITS, max: MAX_CREDITS })

    if (result.sections.length > 0) {
      setSections(result.sections)
      setWarnings(result.warnings)
      saveSchedule(result.sections)
      showToast(`Built a ${result.totalCredits}-credit schedule!`)
    } else {
      // DB returned no sections — fall back to plan courses
      const planCourses = loadPlan()
      const planSections = planCourses
        .filter(c => c.crn)
        .map(c => planCourseToSection(c, gd))

      if (planSections.length > 0) {
        // De-conflict
        const picked = []
        for (const s of planSections) {
          if (!conflictsWithBasket(s, picked)) {
            picked.push(s)
            if (totalCredits(picked) >= MAX_CREDITS) break
          }
        }
        setSections(picked)
        saveSchedule(picked)
        showToast(`Built schedule from ${picked.length} planned courses!`)
      } else {
        setWarnings(result.warnings?.length ? result.warnings : ['No sections found in the database. Make sure courses are loaded.'])
        showToast('Auto-build found no open sections.', 'info')
      }
    }
  }

  function handleRemove(crn) {
    setSections(prev => {
      const next = prev.filter(s => s.crn !== crn)
      saveSchedule(next)
      return next
    })
    if (selectedSection?.crn === crn) setSelected(null)
  }

  function handleSwap(section) {
    setSwapTarget(section)
  }

  function handleSwapConfirm(oldSection, newSection) {
    setSections(prev => {
      const enriched = {
        ...newSection,
        fulfills: oldSection.fulfills,
        name: oldSection.name || newSection.name,
      }
      const next = prev.map(s => s.crn === oldSection.crn ? enriched : s)
      saveSchedule(next)
      showToast(`Swapped to section ${newSection.section}`)
      return next
    })
  }

  function handleClear() {
    setSections([])
    saveSchedule([])
    setSelected(null)
    showToast('Schedule cleared', 'info')
  }

  function handleAdd(section) {
    if (sections.some(s => s.crn === section.crn)) {
      showToast('Already in schedule', 'info')
      return
    }
    if (sections.some(s => s.code === section.code)) {
      showToast('A section of this course is already added', 'info')
      return
    }
    if (conflictsWithBasket(section, sections)) {
      showToast('Time conflict with existing course', 'error')
      return
    }
    const credits = totalCredits(sections) + (Number(section.credits) || 3)
    if (credits > MAX_CREDITS) {
      showToast(`Would exceed ${MAX_CREDITS}-credit maximum`, 'error')
      return
    }
    const enriched = {
      ...section,
      fulfills: getRequirementLabels(section, gapData),
    }
    setSections(prev => {
      const next = [...prev, enriched]
      saveSchedule(next)
      return next
    })
    showToast(`Added ${section.code}`)
  }

  const [showPricing, setShowPricing] = useState(false)
  const [subscribed, setSubscribed]   = useState(() => isSubscribed())

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <div className="text-gray-500 dark:text-gray-400">Building your schedule…</div>
        </div>
      </div>
    )
  }

  if (!subscribed) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 px-6 text-center">
        <div className="max-w-md">
          <div className="w-20 h-20 bg-miami-red rounded-3xl flex items-center justify-center text-4xl mx-auto mb-5 shadow-xl shadow-miami-red/30">
            📅
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-gray-100 mb-2">
            Schedule builder is a premium feature
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed mb-6">
            Build a conflict-free, requirement-filling schedule in seconds.
            Auto-fills your Miami Plan gaps, major core courses, and leaves room for electives — all at once.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setShowPricing(true)}
              className="w-full py-4 bg-miami-red text-white font-extrabold text-sm rounded-xl hover:bg-miami-red-dark transition-colors shadow-lg shadow-miami-red/25 active:scale-95"
            >
              🔓 Unlock full access — $10 per semester →
            </button>
            <button
              onClick={() => navigate('/results')}
              className="w-full py-3 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-sm font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              ← Back to my recommendations
            </button>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
            $18 for the full year · One-time · No subscription
          </p>
        </div>

        {showPricing && (
          <PricingModal
            onClose={() => setShowPricing(false)}
            onSuccess={() => { setSubscribed(true); setShowPricing(false) }}
            highlightFeature="the Schedule Builder"
          />
        )}
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950 overflow-hidden transition-colors duration-200">
      {/* ── Top bar ── */}
      <div className="flex-shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-2 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/results')} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-sm">← Back</button>
          <div className="text-sm font-bold text-gray-800 dark:text-gray-200">
            📅 Schedule Builder
            {profile?.major && <span className="ml-2 font-normal text-gray-500 dark:text-gray-400">· {profile.major}</span>}
            {gapData?.major?.degree && <span className="ml-1 font-normal text-gray-400 dark:text-gray-500">({gapData.major.degree})</span>}
          </div>
          {gapLoading && <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />}
        </div>

        <div className="flex items-center gap-3">
          {/* Term badge */}
          <div className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full font-medium">Fall 2026</div>

          {/* Overall progress */}
          {gapData?.summary && (
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                <div className="bg-red-500 h-1.5 rounded-full" style={{ width: `${gapData.summary.overallPercent}%` }} />
              </div>
              <span>{gapData.summary.overallPercent}% to graduation</span>
            </div>
          )}

          {/* Credit pill */}
          <div className={`text-sm font-bold px-3 py-1 rounded-full ${
            totalCredits(sections) < MIN_CREDITS ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400' :
            totalCredits(sections) > MAX_CREDITS ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400' :
            'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
          }`}>
            {totalCredits(sections)} cr
          </div>
        </div>
      </div>

      {/* AI reasoning banner */}
      {aiReasoning && (
        <div className="flex-shrink-0 bg-blue-50 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-900/50 px-4 py-2.5 flex items-start gap-2.5 text-xs text-blue-800 dark:text-blue-300">
          <span className="text-base flex-shrink-0">🤖</span>
          <div className="flex-1"><strong>Roger says: </strong>{aiReasoning}</div>
          <button onClick={() => setAiReasoning(null)} className="ml-auto text-blue-300 hover:text-blue-600 flex-shrink-0">✕</button>
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="flex-shrink-0 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900/50 px-4 py-2 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
          <span>⚠</span>
          {warnings.map((w, i) => <span key={i}>{w}</span>)}
          <button onClick={() => setWarnings([])} className="ml-auto text-amber-400 hover:text-amber-600">✕</button>
        </div>
      )}

      {/* ── 3-panel layout ── */}
      <div className="flex-1 flex overflow-hidden">
        <RequirementsSidebar gapData={gapData} sections={sections} />
        <WeeklyCalendar
          sections={sections}
          onRemove={handleRemove}
          selectedSection={selectedSection}
          onSelect={setSelected}
        />
        <ScheduleSidebar
          sections={sections}
          gapData={gapData}
          onAdd={handleAdd}
          onRemove={handleRemove}
          onSwap={handleSwap}
          onAutoFill={() => aiBuild()}
          onClear={handleClear}
          loading={aiBuildLoading || gapLoading}
        />
      </div>

      {/* Selected course detail panel */}
      {selectedSection && (
        <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-3 flex items-center gap-6">
          <div className="flex-1">
            <div className="font-bold text-gray-900 dark:text-gray-100">{selectedSection.code} — {selectedSection.name}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Section {selectedSection.section} · CRN {selectedSection.crn} · {selectedSection.schedule} · {selectedSection.room} ·{' '}
              {Number(selectedSection.seats_avail) > 0 ? `${selectedSection.seats_avail}/${selectedSection.seats_total} seats open` : 'Full'}
            </div>
          </div>
          {selectedSection.fulfills?.length > 0 && (
            <div className="flex gap-2">
              {selectedSection.fulfills.map(f => (
                <span key={f.id} className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 px-2 py-1 rounded-full font-medium">
                  Fills: {f.label}
                </span>
              ))}
            </div>
          )}
          <button onClick={() => handleSwap(selectedSection)} className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">↔ Swap</button>
          <button onClick={() => handleRemove(selectedSection.crn)} className="px-3 py-1.5 text-sm border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30">✕ Remove</button>
          <button onClick={() => setSelected(null)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">✕</button>
        </div>
      )}

      {/* Swap modal */}
      {swapTarget && (
        <SwapModal
          section={swapTarget}
          gapData={gapData}
          currentSchedule={sections}
          onConfirm={handleSwapConfirm}
          onClose={() => setSwapTarget(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toast.type === 'error' ? 'bg-red-600 text-white' :
          toast.type === 'info'  ? 'bg-gray-700 text-white' :
          'bg-emerald-600 text-white'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
