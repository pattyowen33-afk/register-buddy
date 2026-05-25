import { useState, useEffect, useCallback } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { getRecommendations } from '../api'
import { saveProfile, loadPlan, addToPlan, removeFromPlan, clearPlan } from '../lib/userProfile'
import { isSubscribed } from '../lib/subscription'
import PricingModal from '../components/PricingModal'

// ── Mock data ─────────────────────────────────────────────────────────────────

const FREE_RESULTS = [
  {
    rank: 1, code: 'CSE 383', name: 'Web Application Programming', credits: 3,
    professor: 'Dr. Alan Hayes', rmpScore: 4.7, rmpCount: 124,
    schedule: 'MWF 10:00–10:50am', room: 'Benton 215',
    seats: 8, totalSeats: 30, fitScore: 98,
    tag: 'Top Pick', tagStyle: 'bg-miami-red text-white',
    difficulty: 'Moderate', workloadHours: '8–10 hrs/wk',
    requirements: ['Major Core (CSE)', 'Miami Plan: Creative Arts'],
    reasoning: "Directly satisfies your CSE major core. You've completed CSE 271 (the prereq) so you're eligible now. Dr. Hayes' 4.7 RMP is one of the highest in CS, and MWF 10am fits your morning preference.",
    interests: ['AI & ML', 'Data Science'],
  },
  {
    rank: 2, code: 'MTH 251', name: 'Calculus I', credits: 5,
    professor: 'Dr. Priya Patel', rmpScore: 4.4, rmpCount: 89,
    schedule: 'TR 9:30–10:45am', room: 'Bachelor 018',
    seats: 14, totalSeats: 35, fitScore: 94,
    tag: 'Req. Needed', tagStyle: 'bg-blue-600 text-white',
    difficulty: 'Challenging', workloadHours: '10–12 hrs/wk',
    requirements: ['Miami Plan: Formal Reasoning', 'CS Major Prereq'],
    reasoning: "Calc I unlocks 6 required upper-level CS courses. Taking it now puts you on the fastest path. Dr. Patel teaches it specifically for CS students.",
    interests: [],
  },
  {
    rank: 3, code: 'ENG 312', name: 'Technical Writing', credits: 3,
    professor: 'Prof. Susan Liang', rmpScore: 4.8, rmpCount: 67,
    schedule: 'MWF 1:00–1:50pm', room: 'Laws 112',
    seats: 22, totalSeats: 25, fitScore: 88,
    tag: 'Easy A', tagStyle: 'bg-emerald-600 text-white',
    difficulty: 'Light', workloadHours: '5–6 hrs/wk',
    requirements: ['Miami Plan: Written Comm', 'CS Major Req'],
    reasoning: "Knocks out two requirements at once. Prof. Liang has stellar reviews, and the light workload balances Calc I.",
    interests: ['Research & Writing'],
  },
  {
    rank: 4, code: 'STA 301', name: 'Applied Statistics', credits: 4,
    professor: 'Dr. James Okafor', rmpScore: 4.2, rmpCount: 51,
    schedule: 'TR 11:00am–12:15pm', room: 'Upham 102',
    seats: 3, totalSeats: 28, fitScore: 83,
    tag: 'Filling Fast', tagStyle: 'bg-amber-500 text-white',
    difficulty: 'Moderate', workloadHours: '7–9 hrs/wk',
    requirements: ['CS Major Elective', 'Miami Plan: Formal Reasoning'],
    reasoning: "Excellent for CS students going into data or ML. Only 3 seats — worth grabbing now if you're interested.",
    interests: ['Data Science', 'AI & ML'],
  },
  {
    rank: 5, code: 'MGT 291', name: 'Intro to Management', credits: 3,
    professor: 'Dr. Rebecca Torres', rmpScore: 4.5, rmpCount: 203,
    schedule: 'MWF 11:00–11:50am', room: 'Farmer 0010',
    seats: 18, totalSeats: 40, fitScore: 75,
    tag: 'Elective Fit', tagStyle: 'bg-purple-600 text-white',
    difficulty: 'Light', workloadHours: '4–5 hrs/wk',
    requirements: ['Miami Plan: Social Science'],
    reasoning: "Fulfills your Miami Plan social science requirement with a 4.5-rated prof and light workload.",
    interests: ['Entrepreneurship'],
  },
]

const LOCKED_RESULTS = [
  {
    rank: 6, code: 'CSE 432', name: 'Machine Learning', credits: 3,
    professor: 'Dr. Sophia Chen', rmpScore: 4.6, rmpCount: 88,
    schedule: 'TR 2:00–3:15pm', room: 'Benton 310',
    seats: 0, totalSeats: 25, fitScore: 95,
    tag: 'Premium Pick', tagStyle: 'bg-amber-500 text-white',
    difficulty: 'Challenging', workloadHours: '10–12 hrs/wk',
    requirements: ['Major Elective (CSE)', 'AI & ML Track'],
    reasoning: "Highest-demand CS elective — seats go in minutes. Dr. Chen's curriculum is industry-aligned. Waitlist alert recommended.",
    interests: ['AI & ML', 'Data Science'],
  },
  {
    rank: 7, code: 'PHI 281', name: 'Ethics of Technology', credits: 3,
    professor: 'Prof. David Kim', rmpScore: 4.9, rmpCount: 44,
    schedule: 'MWF 2:00–2:50pm', room: 'Laws 219',
    seats: 4, totalSeats: 30, fitScore: 89,
    tag: 'Premium Pick', tagStyle: 'bg-amber-500 text-white',
    difficulty: 'Light', workloadHours: '4–5 hrs/wk',
    requirements: ['Miami Plan: Global', 'Ethics Elective'],
    reasoning: "Prof. Kim's highest-rated course in the department. Light workload, satisfies Miami Plan Global req. Easy complement to your heavier CS load.",
    interests: ['Entrepreneurship', 'Research & Writing'],
  },
  {
    rank: 8, code: 'ECO 201', name: 'Microeconomics', credits: 3,
    professor: 'Dr. Angela Ross', rmpScore: 4.3, rmpCount: 112,
    schedule: 'TR 12:30–1:45pm', room: 'Upham 218',
    seats: 11, totalSeats: 35, fitScore: 81,
    tag: 'Premium Pick', tagStyle: 'bg-amber-500 text-white',
    difficulty: 'Moderate', workloadHours: '6–8 hrs/wk',
    requirements: ['Miami Plan: Social Science'],
    reasoning: "Knocks out your Miami Plan Social Science requirement. Pairs well with your stats interest and opens business elective pathways.",
    interests: ['Data Science'],
  },
]

const ALL_RESULTS = [...FREE_RESULTS, ...LOCKED_RESULTS]

// ── Paywall divider shown after free courses ──────────────────────────────────

function PaywallDivider({ onUpgrade }) {
  return (
    <div className="relative my-2">
      {/* Blurred ghost cards */}
      <div className="space-y-3 pointer-events-none select-none">
        {[1, 2, 3].map(i => (
          <div key={i} className={`rounded-2xl border border-gray-100 bg-white shadow-sm p-5 blur-[3px] opacity-${70 - i * 12}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="h-5 w-24 bg-gray-200 rounded-full" />
              <div className="h-5 w-10 bg-gray-100 rounded-full" />
            </div>
            <div className="h-5 w-48 bg-gray-200 rounded-full mb-1" />
            <div className="h-3 w-20 bg-gray-100 rounded-full mb-3" />
            <div className="flex gap-3 mb-3">
              <div className="h-3 w-32 bg-gray-100 rounded-full" />
              <div className="h-3 w-24 bg-gray-100 rounded-full" />
            </div>
            <div className="h-2 bg-gray-100 rounded-full" />
          </div>
        ))}
      </div>

      {/* CTA overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-t from-gray-50 via-gray-50/80 to-transparent dark:from-gray-950 dark:via-gray-950/80 rounded-2xl pt-8">
        <div className="text-center px-6">
          <div className="w-14 h-14 bg-miami-red rounded-2xl flex items-center justify-center text-3xl mx-auto mb-3 shadow-lg shadow-miami-red/25">🔓</div>
          <h3 className="font-extrabold text-gray-900 dark:text-gray-100 text-lg mb-1">
            17 more personalized picks waiting
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
            Plus Roger AI auto-builds your conflict-free schedule in seconds.
            <br />
            <span className="font-semibold text-gray-700 dark:text-gray-300">$10 for the semester — less than one late add/drop fee.</span>
          </p>
          <button
            onClick={onUpgrade}
            className="bg-miami-red text-white font-extrabold text-sm px-8 py-3.5 rounded-xl hover:bg-miami-red-dark transition-colors shadow-lg shadow-miami-red/25 active:scale-95"
          >
            Unlock full access — $10 →
          </button>
          <p className="text-xs text-gray-400 mt-2">One-time · No subscription · $18 for the full year</p>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RmpPill({ score }) {
  const color =
    score >= 4.5 ? 'bg-emerald-100 text-emerald-700' :
    score >= 3.5 ? 'bg-blue-100 text-blue-700' :
                   'bg-amber-100 text-amber-700'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${color}`}>
      ⭐ {score}
    </span>
  )
}

function SeatBar({ seats, total }) {
  const pct = Math.round(((total - seats) / total) * 100)
  const urgent = seats === 0
  const warn = seats <= 5
  const low = seats <= 10
  const barColor = urgent || warn ? 'bg-red-500' : low ? 'bg-amber-400' : 'bg-emerald-400'
  const textColor = urgent || warn ? 'text-red-600' : low ? 'text-amber-600' : 'text-gray-400'
  const label = urgent ? '🚫 Full' : warn ? `🔥 ${seats} left` : low ? `⚠️ ${seats} left` : `${seats} seats left`
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-semibold whitespace-nowrap flex-shrink-0 ${textColor}`}>{label}</span>
    </div>
  )
}

// ── Free course card ──────────────────────────────────────────────────────────

function CourseCard({ course, added, onAdd, onSkip, onUpgradeWaitlist, onBuildSchedule }) {
  const [expanded, setExpanded] = useState(false)
  const isFull = course.seats === 0

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-2xl border transition-all duration-200 overflow-hidden ${
      added ? 'border-emerald-300 dark:border-emerald-800 shadow-md shadow-emerald-50 dark:shadow-emerald-900/20' : 'border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-md hover:border-gray-200 dark:hover:border-gray-700'
    }`}>
      <div className="p-4 sm:p-5">
        {/* Row 1: tag · interests · fit% · credits */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${course.tagStyle}`}>
              #{course.rank} {course.tag}
            </span>
            {course.interests.map(i => (
              <span key={i} className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600">{i}</span>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-miami-red font-black text-base">{course.fitScore}<span className="text-xs font-semibold text-gray-300">%</span></span>
            <span className="text-xs text-gray-300 border-l border-gray-100 pl-2">{course.credits} cr</span>
          </div>
        </div>

        {/* Row 2: name + code */}
        <h3 className="font-extrabold text-gray-900 dark:text-gray-100 text-[15px] sm:text-base leading-snug mb-0.5">{course.name}</h3>
        <p className="text-xs text-gray-400 dark:text-gray-500 font-semibold mb-3">{course.code}</p>

        {/* Row 3: professor · RMP · time */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-600 dark:text-gray-400 mb-3">
          <span className="flex items-center gap-1.5">
            <span>👨‍🏫</span>
            <span className="font-medium">{course.professor}</span>
            <RmpPill score={course.rmpScore} />
          </span>
          <span className="flex items-center gap-1.5">
            <span>🕐</span>
            <span className="font-medium">{course.schedule}</span>
          </span>
        </div>

        {/* Row 4: seat bar */}
        <SeatBar seats={course.seats} total={course.totalSeats} />

        {/* Waitlist alert CTA for full/near-full sections */}
        {(isFull || course.seats <= 3) && (
          <button
            onClick={() => onUpgradeWaitlist()}
            className={`mt-2.5 w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-colors ${
              isFull
                ? 'bg-red-50 border border-red-200 text-red-700 hover:bg-red-100'
                : 'bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100'
            }`}
          >
            <span>🔔</span>
            {isFull ? 'Get notified when a seat opens — Premium' : 'Alert me if this fills up — Premium'}
          </button>
        )}
      </div>

      {/* Expandable: requirements + reasoning */}
      <div className="border-t border-gray-50 dark:border-gray-800">
        <button
          className="w-full flex items-center justify-between px-4 sm:px-5 py-2.5 text-xs font-semibold text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50/70 dark:hover:bg-gray-800/50 transition-colors"
          onClick={() => setExpanded(e => !e)}
        >
          <span className="flex items-center gap-1.5"><span>🤖</span> Why this course + requirements</span>
          <span className={`transition-transform duration-200 text-sm ${expanded ? 'rotate-180' : ''}`}>▾</span>
        </button>
        {expanded && (
          <div className="px-4 sm:px-5 pb-4 space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {course.requirements.map(r => (
                <span key={r} className="inline-flex items-center gap-1 text-xs bg-emerald-50 border border-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-medium">
                  ✅ {r}
                </span>
              ))}
              <span className="inline-flex items-center gap-1 text-xs bg-gray-50 border border-gray-100 text-gray-500 px-2.5 py-1 rounded-full font-medium">
                📊 {course.difficulty} · {course.workloadHours}
              </span>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 rounded-xl p-3">{course.reasoning}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className={`border-t px-4 sm:px-5 py-3 flex gap-2 ${added ? 'border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/20' : 'border-gray-50 dark:border-gray-800 bg-gray-50/40 dark:bg-gray-800/30'}`}>
        {added ? (
          <div className="flex-1 flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            <span>✓</span> Added to plan
          </div>
        ) : (
          <button onClick={onAdd} className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-miami-red text-white hover:bg-miami-red-dark transition-colors active:scale-95">
            + Add to plan
          </button>
        )}
        <button
          onClick={onBuildSchedule}
          className="px-3 py-2.5 rounded-xl text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-800 hover:border-gray-300 transition-colors whitespace-nowrap"
          title="Open schedule builder"
        >
          🗓 Schedule
        </button>
        {!added && (
          <button onClick={onSkip} className="px-3 py-2.5 rounded-xl text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-800 transition-colors">
            Skip
          </button>
        )}
      </div>
    </div>
  )
}

// ── Locked course card — partial reveal ───────────────────────────────────────

function LockedCard({ course, onUpgrade }) {
  const urgent = course.seats === 0
  const warn = course.seats <= 5

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden group hover:border-amber-200 dark:hover:border-amber-800 hover:shadow-md transition-all">
      {/* Always visible: rank, name, code, fitScore, credits */}
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
            🔒 #{course.rank} Premium Pick
          </span>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-miami-red font-black text-base">{course.fitScore}<span className="text-xs font-semibold text-gray-300">%</span></span>
            <span className="text-xs text-gray-300 border-l border-gray-100 pl-2">{course.credits} cr</span>
          </div>
        </div>
        <h3 className="font-extrabold text-gray-900 dark:text-gray-100 text-[15px] mb-0.5">{course.name}</h3>
        <p className="text-xs font-bold text-miami-red mb-3">{course.code}</p>

        {/* Blurred professor + schedule rows */}
        <div className="space-y-2 mb-3 select-none pointer-events-none blur-[3px]">
          <div className="flex items-center gap-2">
            <span className="text-sm">👨‍🏫</span>
            <div className="h-4 w-36 bg-gray-200 rounded-full" />
            <div className="h-5 w-10 bg-gray-200 rounded-full" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">🕐</span>
            <div className="h-4 w-28 bg-gray-200 rounded-full" />
          </div>
        </div>

        {/* Seat status — this part IS visible to create urgency */}
        <div className={`flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-xl ${
          urgent ? 'bg-red-50 text-red-600 border border-red-200' :
          warn   ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                   'bg-gray-50 text-gray-500 border border-gray-100'
        }`}>
          <span>{urgent ? '🚫' : warn ? '🔥' : '📋'}</span>
          <span>{urgent ? 'Section full — waitlist alert available' : warn ? `Only ${course.seats} seats left` : `${course.seats} seats available`}</span>
        </div>

        {/* Requirement teaser */}
        <p className="text-xs text-gray-400 mt-2.5">✅ Satisfies: <span className="font-semibold text-gray-600">{course.requirement}</span></p>
      </div>

      {/* Action */}
      <div className="border-t border-gray-100 px-4 sm:px-5 py-3 bg-amber-50/40">
        <button
          onClick={() => onUpgrade(urgent ? 'waitlist' : 'add_to_plan')}
          className="w-full py-2.5 rounded-xl text-xs font-bold bg-amber-400 text-amber-900 hover:bg-amber-500 transition-colors active:scale-95 flex items-center justify-center gap-1.5"
        >
          {urgent ? '🔔 Unlock waitlist alert' : '🔓 Unlock to see full details + add to plan'}
        </button>
      </div>
    </div>
  )
}

// ── Locked sidebar widget ─────────────────────────────────────────────────────

function LockedSideWidget({ icon, title, desc, onUpgrade }) {
  return (
    <div className="relative bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
      <div className="p-5 blur-sm select-none pointer-events-none">
        <div className="w-1/2 h-3 bg-gray-200 rounded mb-3" />
        <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-8 bg-gray-100 rounded-lg" />)}</div>
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-[2px] p-4">
        <span className="text-2xl mb-1.5">{icon}</span>
        <p className="text-sm font-bold text-gray-900 mb-1">{title}</p>
        <p className="text-xs text-gray-400 text-center mb-3 leading-relaxed">{desc}</p>
        <button
          onClick={() => onUpgrade('general')}
          className="text-xs font-bold bg-miami-red text-white px-4 py-2 rounded-xl hover:bg-miami-red-dark transition-colors"
        >
          Unlock Premium
        </button>
      </div>
    </div>
  )
}

// ── Main Results page ─────────────────────────────────────────────────────────

export default function Results() {
  const { state } = useLocation()
  const navigate = useNavigate()
  const prefs = state?.preferences || {}

  // Subscription (real gate — not a toggle)
  const [subscribed, setSubscribed] = useState(() => isSubscribed())
  const [showPricing, setShowPricing] = useState(false)
  const openUpgrade = () => setShowPricing(true)
  const closeUpgrade = () => setShowPricing(false)
  const handleSubscribed = () => {
    setSubscribed(true)
    setShowPricing(false)
  }

  // Handle Stripe redirect back with ?session_id=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get('session_id')
    if (!sessionId || isSubscribed()) return

    import('../lib/subscription').then(({ verifyCheckout }) => {
      verifyCheckout(sessionId)
        .then(() => {
          setSubscribed(true)
          // Clean URL
          window.history.replaceState({}, '', window.location.pathname)
        })
        .catch(err => console.warn('Stripe verify failed:', err.message))
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [addedCourses, setAddedCourses] = useState(() => new Set(loadPlan().map(c => c.code)))
  const [plan, setPlan] = useState(() => loadPlan())
  const [planOpen, setPlanOpen] = useState(false)
  const [skippedCourses, setSkippedCourses] = useState(new Set())
  const [activeFilter, setActiveFilter] = useState('All')
  const [apiResults, setApiResults] = useState(null)
  const [apiLoading, setApiLoading] = useState(false)
  const [apiError, setApiError]   = useState(null)

  // Sync addedCourses set with plan on mount
  useEffect(() => {
    const saved = loadPlan()
    setPlan(saved)
    setAddedCourses(new Set(saved.map(c => c.code)))
    if (saved.length > 0) setPlanOpen(true)
  }, [])

  // Try to load real recommendations from backend
  useEffect(() => {
    if (!prefs.major) return
    setApiLoading(true)
    setApiError(null)
    getRecommendations({
      major: prefs.major,
      minor: prefs.minor || '',
      completedCourses: prefs.completedCourses || [],
      preferences: prefs,
    })
      .then(data => {
        if (data.results?.length) {
          const mapped = data.results.map(r => ({
            rank:         r.rank,
            code:         r.code,
            name:         r.name,
            credits:      r.credits || 3,
            fitScore:     r.fitScore,
            professor:    r.instructor || 'Staff',
            rmpScore:     r.rmp_score || null,
            rmpCount:     null,
            schedule:     r.schedule || 'TBA',
            room:         r.room || '',
            seats:        r.seats_avail ?? 0,
            totalSeats:   r.seats_total ?? 30,
            tag:          r.rank === 1 ? 'Top Pick' : r.requirementType || 'Recommended',
            tagStyle:     r.rank === 1 ? 'bg-miami-red text-white' :
                          r.requirementType?.includes('Core') ? 'bg-blue-600 text-white' :
                          'bg-purple-600 text-white',
            difficulty:   r.level === 'intro' ? 'Light' : r.level === 'upper' ? 'Challenging' : 'Moderate',
            workloadHours:'Varies',
            requirements: [r.requirementType].filter(Boolean),
            reasoning:    r.reasons?.join(' ') || '',
            interests:    [],
            crn:          r.crn,
            days:         r.days,
            start_time:   r.start_time,
            end_time:     r.end_time,
            delivery:     r.delivery,
          }))
          setApiResults(mapped)
        }
        setApiLoading(false)
      })
      .catch(() => {
        setApiError('offline')
        setApiLoading(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.major])

  // Use API results if available, else mock data
  // Free users see 3 teasers; subscribed users see all 20
  const FREE_LIMIT  = 3
  const liveResults = apiResults || ALL_RESULTS
  const resultPool  = subscribed ? liveResults : liveResults.slice(0, FREE_LIMIT)
  const filters = ['All', 'Core Req.', 'Miami Plan', 'Easy Load']
  const visibleResults = resultPool.filter(c => {
    if (skippedCourses.has(c.rank)) return false
    if (activeFilter === 'All') return true
    if (activeFilter === 'Core Req.') return c.requirements.some(r => r.includes('Major'))
    if (activeFilter === 'Miami Plan') return c.requirements.some(r => r.includes('Miami Plan'))
    if (activeFilter === 'Easy Load') return c.difficulty === 'Light'
    return true
  })

  const planCredits = plan.reduce((s, c) => s + (c.credits || 3), 0)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-24 transition-colors duration-200">

      {/* ── Sticky header ── */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 sticky top-16 z-40 transition-colors">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Results ready</span>
            </div>
            <h1 className="font-extrabold text-gray-900 dark:text-gray-100 text-base leading-tight flex items-center gap-2 flex-wrap">
              {prefs.major ? `${prefs.major} · ${prefs.year || 'Student'}` : 'Your recommendations'}
              {prefs.minor && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                  📚 {prefs.minor} minor
                </span>
              )}
              {apiLoading && <span className="text-xs font-normal text-gray-400 animate-pulse">Loading live data…</span>}
              {apiResults && !apiLoading && <span className="text-xs font-normal text-emerald-500">● Live</span>}
            </h1>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Link to="/onboarding" className="flex-1 sm:flex-none text-center py-2 px-3 rounded-xl text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              ✏️ Edit
            </Link>

            {/* Subscription badge or unlock CTA */}
            {subscribed ? (
              <div className="flex-1 sm:flex-none flex items-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                ✓ Unlocked
              </div>
            ) : (
              <button
                onClick={openUpgrade}
                className="flex-1 sm:flex-none py-2 px-3 rounded-xl text-xs font-bold bg-amber-400 text-amber-900 hover:bg-amber-500 transition-colors"
              >
                🔓 Unlock — $10
              </button>
            )}

            <button
              onClick={() => {
                if (!subscribed) { openUpgrade(); return }
                if (prefs.major) saveProfile(prefs)
                navigate('/schedule')
              }}
              className="flex-1 sm:flex-none py-2 px-4 rounded-xl text-xs font-bold bg-miami-red text-white hover:bg-miami-red-dark transition-colors whitespace-nowrap"
            >
              🗓 Build Schedule
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">

        {/* ── Subscribed welcome banner ── */}
        {subscribed && (
          <div className="mb-5 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-2xl p-4 flex items-center gap-3 shadow-sm">
            <span className="text-2xl">✓</span>
            <div>
              <p className="font-bold text-white text-sm">Full access unlocked — all 20 picks available</p>
              <p className="text-emerald-100 text-xs">Schedule builder · Roger AI advisor · Requirement gap tracker</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Main column ── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Filter bar */}
            <div className="flex gap-1.5 flex-wrap">
              {filters.map(f => (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                    activeFilter === f
                      ? 'bg-miami-red text-white border-miami-red'
                      : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  {f}
                </button>
              ))}
              {skippedCourses.size > 0 && (
                <button
                  className="px-3 py-1.5 rounded-full text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
                  onClick={() => setSkippedCourses(new Set())}
                >
                  Show {skippedCourses.size} skipped
                </button>
              )}
            </div>

            {/* Free preview counter — only shown for non-subscribed users */}
            {!subscribed && (
              <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 pb-1">
                <span className="font-semibold text-gray-600 dark:text-gray-400">Showing {Math.min(visibleResults.length, 3)} of 20 picks</span>
                <span className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                <button onClick={openUpgrade} className="text-miami-red font-bold hover:underline">Unlock all 20 →</button>
              </div>
            )}

            {/* Results — 3 free, rest gated until subscribed */}
            {visibleResults.map((course) => (
              <CourseCard
                key={course.rank}
                course={course}
                added={addedCourses.has(course.code)}
                onAdd={() => {
                  const updated = addToPlan(course)
                  setPlan(updated)
                  setAddedCourses(new Set(updated.map(c => c.code)))
                  setPlanOpen(true)
                }}
                onSkip={() => setSkippedCourses(prev => new Set([...prev, course.rank]))}
                onUpgradeWaitlist={openUpgrade}
                onBuildSchedule={() => {
                  if (!subscribed) { openUpgrade(); return }
                  if (prefs.major) saveProfile(prefs)
                  navigate('/schedule')
                }}
              />
            ))}

            {/* Paywall divider — free users only, after free cards */}
            {!subscribed && (
              <PaywallDivider onUpgrade={openUpgrade} />
            )}
          </div>

          {/* ── Sidebar ── */}
          <div className="space-y-4">

            {/* My plan summary */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">My plan</p>
              <div className="space-y-2.5 mb-4">
                {[
                  { label: 'Courses added', val: `${plan.length}`, sub: `of ${resultPool.length}` },
                  { label: 'Credit hours', val: `${planCredits}`, sub: `of ${prefs.credits || 15} target` },
                  { label: 'Reqs covered', val: '0', sub: 'of 6 needed', color: plan.length > 0 ? 'text-emerald-600' : 'text-amber-600' },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">{r.label}</span>
                    <span className={`text-sm font-bold ${r.color || 'text-gray-900'}`}>
                      {r.val} <span className="text-xs text-gray-300 font-normal">{r.sub}</span>
                    </span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  if (!subscribed) { openUpgrade(); return }
                  if (prefs.major) saveProfile(prefs)
                  navigate('/schedule')
                }}
                className="w-full btn-primary text-xs py-2.5"
              >
                🗓 Build My Schedule →
              </button>
              <p className="text-xs text-gray-300 text-center mt-1.5">Roger AI builds a conflict-free schedule</p>
            </div>

            {/* Req gap check */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Requirement gaps</p>
              <div className="space-y-3">
                {[
                  { label: 'Major Core',               done: 3, total: 12, color: 'bg-miami-red' },
                  { label: 'Miami Plan: English',       done: 1, total: 2,  color: 'bg-blue-500' },
                  { label: 'Miami Plan: Formal Reason', done: 0, total: 1,  color: 'bg-amber-500' },
                  { label: 'Miami Plan: Social Sci',    done: 0, total: 2,  color: 'bg-purple-500' },
                  { label: 'Free Electives',            done: 0, total: 6,  color: 'bg-gray-400' },
                ].map(r => (
                  <div key={r.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-600 font-medium truncate pr-2">{r.label}</span>
                      <span className="text-gray-300 flex-shrink-0">{r.done}/{r.total}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${r.color} rounded-full transition-all`} style={{ width: `${(r.done/r.total)*100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Waitlist alerts */}
            {subscribed ? (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-emerald-200 dark:border-emerald-800 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">🔔</span>
                  <p className="text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-widest">Seat alerts</p>
                  <span className="ml-auto text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">Active</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Add a course to your plan and we'll alert you if seats drop below 5.</p>
                <button className="w-full text-xs font-semibold py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition-colors">
                  + Watch a section
                </button>
              </div>
            ) : (
              <LockedSideWidget
                icon="🔔" title="Seat alerts"
                desc="Get notified when seats open in any full section."
                onUpgrade={openUpgrade}
              />
            )}

            {/* Multi-semester planner */}
            {subscribed ? (
              <div className="bg-white dark:bg-gray-900 rounded-2xl border border-emerald-200 dark:border-emerald-800 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">📆</span>
                  <p className="text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-widest">Multi-semester plan</p>
                  <span className="ml-auto text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">Active</span>
                </div>
                <div className="space-y-1.5">
                  {['Fall 2026 (current)', 'Spring 2027', 'Fall 2027'].map((sem, i) => (
                    <div key={sem} className="flex items-center justify-between text-xs">
                      <span className={i === 0 ? 'font-bold text-gray-800 dark:text-gray-200' : 'text-gray-400'}>{sem}</span>
                      <span className={i === 0 ? 'text-miami-red font-bold' : 'text-gray-300'}>{i === 0 ? `${plan.length} courses` : 'Plan →'}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <LockedSideWidget
                icon="📆" title="Multi-semester planner"
                desc="Map out your full degree, semester by semester."
                onUpgrade={openUpgrade}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── My Plan sticky tray ── */}
      {plan.length > 0 && (
        <div className={`fixed bottom-0 left-0 right-0 z-50 transition-all duration-300 ${planOpen ? '' : ''}`}>
          {/* Collapsed tab */}
          {!planOpen && (
            <div className="flex justify-center pb-2">
              <button
                onClick={() => setPlanOpen(true)}
                className="flex items-center gap-2 bg-miami-red text-white text-xs font-bold px-5 py-2.5 rounded-t-2xl shadow-xl shadow-miami-red/30 hover:bg-miami-red-dark transition-colors"
              >
                📋 My Plan — {plan.length} course{plan.length !== 1 ? 's' : ''} · {planCredits} credits
                <span className="text-red-200">▲</span>
              </button>
            </div>
          )}

          {/* Expanded tray */}
          {planOpen && (
            <div className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shadow-2xl shadow-black/30">
              {/* Tray header */}
              <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setPlanOpen(false)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                    aria-label="Collapse plan"
                  >
                    ▼
                  </button>
                  <span className="font-black text-gray-900 dark:text-gray-100 text-sm">
                    📋 My Plan
                  </span>
                  <span className="text-xs text-gray-400">
                    {plan.length} course{plan.length !== 1 ? 's' : ''} · <span className={`font-bold ${planCredits >= 12 && planCredits <= 18 ? 'text-emerald-600' : 'text-amber-600'}`}>{planCredits} credits</span>
                    {planCredits < 12 && <span className="text-amber-500 ml-1">(add more)</span>}
                    {planCredits > 18 && <span className="text-red-500 ml-1">(over limit)</span>}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      clearPlan()
                      setPlan([])
                      setAddedCourses(new Set())
                      setPlanOpen(false)
                    }}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
                  >
                    Clear all
                  </button>
                  <button
                    onClick={() => {
                      if (!subscribed) { openUpgrade(); return }
                      if (prefs.major) saveProfile(prefs)
                      navigate('/schedule')
                    }}
                    className="flex items-center gap-1.5 bg-miami-red text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-miami-red-dark transition-colors shadow-sm shadow-miami-red/20 active:scale-95"
                  >
                    {subscribed ? '🗓 Build My Schedule →' : '🔓 Unlock + Build Schedule →'}
                  </button>
                </div>
              </div>

              {/* Course list */}
              <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
                <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
                  {plan.map(course => (
                    <div
                      key={course.code}
                      className="flex-shrink-0 flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl px-3 py-2 min-w-0"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-900 dark:text-gray-100 whitespace-nowrap">{course.code}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[120px]">{course.name}</p>
                      </div>
                      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">{course.credits || 3} cr</span>
                      <button
                        onClick={() => {
                          const updated = removeFromPlan(course.code)
                          setPlan(updated)
                          setAddedCourses(new Set(updated.map(c => c.code)))
                          if (updated.length === 0) setPlanOpen(false)
                        }}
                        className="text-gray-300 hover:text-red-500 dark:hover:text-red-400 transition-colors ml-0.5 flex-shrink-0 text-sm leading-none"
                        aria-label={`Remove ${course.code}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {/* Add more nudge */}
                  {plan.length < 5 && (
                    <div className="flex-shrink-0 flex items-center gap-2 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2">
                      <span className="text-xs text-gray-300 whitespace-nowrap">+ add more courses above</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Pricing modal ── */}
      {showPricing && (
        <PricingModal
          onClose={closeUpgrade}
          onSuccess={handleSubscribed}
          email={prefs.email || ''}
        />
      )}
    </div>
  )
}
