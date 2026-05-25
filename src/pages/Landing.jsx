import { Link } from 'react-router-dom'

const features = [
  {
    icon: '🎯',
    title: 'Requirement matcher',
    desc: 'Automatically maps courses to your major requirements and Miami Plan gen-eds so nothing slips through the cracks.',
  },
  {
    icon: '⭐',
    title: 'Professor ratings',
    desc: 'Surfaces the highest-rated instructors for every course on your shortlist — so you avoid the nightmare sections.',
  },
  {
    icon: '📅',
    title: 'AI schedule builder',
    desc: 'Roger builds a complete, conflict-free weekly schedule for you automatically — based on your requirements and preferences.',
  },
  {
    icon: '🤖',
    title: 'Roger AI advisor',
    desc: 'Ask anything: "Do I need CSE 271 before 383?" "What satisfies my Miami Plan writing requirement?" Roger knows your plan.',
  },
  {
    icon: '🔔',
    title: 'Seat alerts',
    desc: 'Get notified the moment a seat opens in a full section. Never miss your shot at a closed course.',
  },
  {
    icon: '📊',
    title: 'Requirement gap tracker',
    desc: 'See exactly what Miami Plan, major, and minor requirements you still need — no more guessing come senior year.',
  },
]

const steps = [
  {
    num: '01',
    title: 'Tell us about yourself',
    desc: 'Enter your major, year, and completed courses. Upload your transcript for instant auto-fill — takes under 2 minutes.',
  },
  {
    num: '02',
    title: 'AI scans the catalog',
    desc: "We cross-check Miami's course catalog against your degree requirements, completed credits, and professor ratings.",
  },
  {
    num: '03',
    title: 'Roger builds your schedule',
    desc: '3 picks free to preview. Unlock all 20 and let Roger AI auto-build a complete, conflict-free schedule in seconds — for $10.',
  },
]

const testimonials = [
  {
    quote: "I spent 3 hours trying to figure out which econ elective satisfied my Miami Plan requirement. RegisterBuddy found the perfect one in seconds.",
    name: 'Mia R.',
    detail: 'Junior, Finance — Farmer School',
  },
  {
    quote: "Roger built my whole schedule in like 30 seconds — picked the right courses, zero conflicts. Way better than BannerWeb.",
    name: 'Jordan K.',
    detail: 'Sophomore, Computer Science',
  },
  {
    quote: "$10 for my whole registration window? That's less than one dining swipe and it actually saved my semester.",
    name: 'Tyler S.',
    detail: 'Senior, Communications',
  },
]

const semesterFeatures = [
  'All 20 personalized course picks',
  'AI schedule builder — Roger auto-builds it',
  'Roger AI advisor (ask anything)',
  'Requirement gap tracker',
  'Seat availability alerts',
  'Valid for one semester',
  'No auto-renewal — ever',
]

const annualFeatures = [
  'Everything in Semester',
  'Covers Fall AND Spring registration',
  'Multi-semester planning roadmap',
  'Priority support',
  'Best value — save $2 vs two semesters',
]

function StarRating({ n }) {
  return (
    <span className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <svg key={i} className={`w-4 h-4 ${i <= n ? 'text-amber-400' : 'text-gray-200'}`} fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  )
}

function CheckIcon({ color = 'text-miami-red' }) {
  return (
    <svg className={`w-5 h-5 ${color} flex-shrink-0 mt-0.5`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  )
}

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* ── HERO ────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-white via-red-50/30 to-white dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 pt-20 pb-28 transition-colors duration-200">
        {/* Background decoration */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -right-32 w-96 h-96 bg-miami-red/5 rounded-full blur-3xl" />
          <div className="absolute top-1/2 -left-24 w-72 h-72 bg-red-100/40 rounded-full blur-3xl" />
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 relative">
          {/* Badge */}
          <div className="flex justify-center mb-8">
            <span className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/50 rounded-full text-miami-red text-sm font-semibold">
              <span className="w-2 h-2 rounded-full bg-miami-red animate-pulse" />
              Built exclusively for Miami University students
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-center text-5xl sm:text-6xl md:text-7xl font-extrabold text-gray-900 dark:text-gray-50 leading-tight mb-6 tracking-tight">
            Stop guessing.<br />
            <span className="text-miami-red">Register smarter.</span>
          </h1>

          <p className="text-center text-lg sm:text-xl text-gray-500 dark:text-gray-400 max-w-2xl mx-auto mb-4 leading-relaxed">
            RegisterBuddy is your AI course advisor — it maps Miami's catalog to your exact requirements, reads professor ratings, and hands you a ranked shortlist in seconds.
          </p>

          {/* Free preview callout */}
          <p className="text-center text-sm text-gray-400 dark:text-gray-500 mb-10">
            See <strong className="text-gray-700 dark:text-gray-300">3 picks free</strong> — no account needed. Unlock all 20 + schedule builder for{' '}
            <strong className="text-miami-red">$10</strong>.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
            <Link to="/onboarding" className="btn-primary text-base px-8 py-4 w-full sm:w-auto text-center shadow-lg shadow-miami-red/20">
              Get my course picks →
            </Link>
            <a href="#how-it-works" className="btn-ghost text-base font-medium text-gray-600 w-full sm:w-auto text-center">
              See how it works
            </a>
          </div>

          {/* Social proof bar */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {['🧑‍💻','👩‍🎓','🧑‍🎨','👨‍🔬'].map((e, i) => (
                  <div key={i} className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-600 dark:to-gray-700 border-2 border-white dark:border-gray-800 flex items-center justify-center text-sm">{e}</div>
                ))}
              </div>
              <span><strong className="text-gray-800 dark:text-gray-200">1,200+</strong> MU students signed up</span>
            </div>
            <span className="hidden sm:block text-gray-300 dark:text-gray-600">|</span>
            <div className="flex items-center gap-1.5">
              <StarRating n={5} />
              <span><strong className="text-gray-800 dark:text-gray-200">4.9</strong> from beta testers</span>
            </div>
            <span className="hidden sm:block text-gray-300 dark:text-gray-600">|</span>
            <span>🔒 No MU login required</span>
          </div>
        </div>
      </section>

      {/* ── MOCK UI PREVIEW ──────────────────────────────────────── */}
      <section className="bg-gray-50 dark:bg-gray-900 py-16 border-y border-gray-100 dark:border-gray-800 overflow-hidden transition-colors duration-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <p className="text-center text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-6">Sample recommendation output</p>
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl dark:shadow-gray-900/40 overflow-hidden">
            {/* Fake top bar */}
            <div className="bg-gray-100 dark:bg-gray-700 px-4 py-3 flex items-center gap-2 border-b border-gray-200 dark:border-gray-600">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-yellow-400" />
              <div className="w-3 h-3 rounded-full bg-green-400" />
              <span className="ml-3 text-xs text-gray-400 dark:text-gray-500 font-mono">registerbuddy.app/results</span>
            </div>
            {/* Preview content */}
            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { code: 'CSE 383', name: 'Web App Programming', prof: 'Dr. Hayes', rmp: 4.7, fit: 98, req: 'Major Core', time: 'MWF 10–10:50am', credits: 3, tag: 'Top Pick' },
                { code: 'MTH 251', name: 'Calculus I', prof: 'Dr. Patel', rmp: 4.4, fit: 91, req: 'Miami Plan', time: 'TR 2–3:15pm', credits: 4, tag: 'Req. Needed' },
                { code: 'ENG 312', name: 'Technical Writing', prof: 'Prof. Liang', rmp: 4.8, fit: 87, req: 'Miami Plan', time: 'MWF 1–1:50pm', credits: 3, tag: 'Easy A' },
              ].map((c) => (
                <div key={c.code} className="rounded-xl border border-gray-100 dark:border-gray-700 p-4 hover:border-miami-red/30 dark:hover:border-miami-red/40 transition-colors bg-white dark:bg-gray-800">
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs font-bold text-miami-red bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded-full">{c.tag}</span>
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">{c.fit}% fit</span>
                  </div>
                  <p className="font-bold text-gray-900 dark:text-gray-100 text-sm mt-2">{c.name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">{c.code} · {c.credits} cr</p>
                  <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-1.5">⏰ {c.time}</div>
                    <div className="flex items-center gap-1.5">👨‍🏫 {c.prof} · RMP {c.rmp}</div>
                    <div className="flex items-center gap-1.5">✅ Satisfies: {c.req}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────── */}
      <section id="features" className="py-24 bg-white dark:bg-gray-950 transition-colors duration-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <p className="text-miami-red text-sm font-semibold uppercase tracking-widest mb-3">What you unlock</p>
            <h2 className="text-4xl font-extrabold text-gray-900 dark:text-gray-50 mb-4">Everything you need to register with confidence</h2>
            <p className="text-lg text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">Built specifically for the Miami University experience — not a generic course planner.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div key={f.title} className="card p-6 group">
                <div className="w-12 h-12 bg-red-50 dark:bg-red-950/40 rounded-xl flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform">
                  {f.icon}
                </div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <p className="text-miami-red text-sm font-semibold uppercase tracking-widest mb-3">How it works</p>
            <h2 className="text-4xl font-extrabold text-gray-900 dark:text-gray-50 mb-4">From zero to schedule in 3 steps</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Connector line */}
            <div className="hidden md:block absolute top-8 left-1/3 right-1/3 h-0.5 bg-gradient-to-r from-miami-red/20 via-miami-red/40 to-miami-red/20" />
            {steps.map((s) => (
              <div key={s.num} className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-miami-red text-white flex items-center justify-center text-xl font-black mb-6 shadow-lg shadow-miami-red/30 relative z-10">
                  {s.num}
                </div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg mb-3">{s.title}</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed max-w-xs">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-14">
            <Link to="/onboarding" className="btn-primary text-base px-8 py-4 shadow-lg shadow-miami-red/20">
              Try it — see your 3 free picks →
            </Link>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ─────────────────────────────────────────── */}
      <section className="py-24 bg-white dark:bg-gray-950 transition-colors duration-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-miami-red text-sm font-semibold uppercase tracking-widest mb-3">Student love</p>
            <h2 className="text-4xl font-extrabold text-gray-900 dark:text-gray-50">What MU students say</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <div key={t.name} className="card p-6">
                <StarRating n={5} />
                <p className="mt-4 text-gray-700 dark:text-gray-300 text-sm leading-relaxed italic">"{t.quote}"</p>
                <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700">
                  <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{t.name}</p>
                  <p className="text-gray-400 dark:text-gray-500 text-xs">{t.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ──────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-miami-red text-sm font-semibold uppercase tracking-widest mb-3">Pricing</p>
            <h2 className="text-4xl font-extrabold text-gray-900 dark:text-gray-50 mb-4">One small payment. One less registration nightmare.</h2>
            <p className="text-gray-500 dark:text-gray-400 text-lg">
              Try free first — see 3 personalized picks with no credit card.{' '}
              <span className="font-semibold text-gray-700 dark:text-gray-300">Unlock everything from $10.</span>
            </p>
          </div>

          {/* Free preview note */}
          <div className="max-w-2xl mx-auto mb-8">
            <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl px-5 py-3.5">
              <span className="text-xl">🎁</span>
              <div>
                <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">Free preview — always available</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">See your top 3 personalized picks the moment you finish setup. No credit card, no account required.</p>
              </div>
              <Link to="/onboarding" className="ml-auto flex-shrink-0 text-xs font-bold text-emerald-700 dark:text-emerald-400 underline underline-offset-2 hover:no-underline whitespace-nowrap">
                Try free →
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto">
            {/* Semester */}
            <div className="card p-7 border-2 border-gray-200 dark:border-gray-700">
              <div className="mb-5">
                <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Semester</p>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-4xl font-black text-gray-900 dark:text-gray-100">$10</span>
                  <span className="text-gray-400 dark:text-gray-500 text-sm">one-time</span>
                </div>
                <p className="text-gray-400 dark:text-gray-500 text-xs">One registration window. No subscription, ever.</p>
              </div>
              <ul className="space-y-2.5 mb-7">
                {semesterFeatures.map(item => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-gray-600 dark:text-gray-400">
                    <CheckIcon color="text-miami-red" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link to="/onboarding" className="btn-primary w-full text-center block text-sm">
                Get semester access →
              </Link>
              <p className="text-gray-400 dark:text-gray-500 text-xs text-center mt-2">Instant unlock · No subscription</p>
            </div>

            {/* Annual — most prominent */}
            <div className="relative bg-miami-red rounded-2xl p-7 text-white shadow-xl shadow-miami-red/30 md:-mt-4 md:-mb-4">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <span className="bg-amber-400 text-amber-900 text-xs font-black px-4 py-1 rounded-full uppercase tracking-wider shadow-sm">
                  Best value
                </span>
              </div>
              <div className="mb-5">
                <p className="text-xs font-bold text-red-200 uppercase tracking-widest mb-2">Full Year</p>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-4xl font-black">$18</span>
                  <span className="text-red-200 text-sm">one-time</span>
                </div>
                <p className="text-red-200 text-xs">Covers Fall AND Spring registration.</p>
              </div>
              <ul className="space-y-2.5 mb-7">
                {annualFeatures.map(item => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-white/90">
                    <svg className="w-5 h-5 text-white flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
              <Link to="/onboarding" className="block w-full text-center bg-white text-miami-red font-bold py-3.5 px-6 rounded-xl hover:bg-red-50 transition-colors text-sm">
                Get full-year access →
              </Link>
              <p className="text-red-300 text-xs text-center mt-2">One payment · No auto-renewal · Ever</p>
            </div>
          </div>

          {/* Trust bar */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mt-10 text-sm text-gray-400 dark:text-gray-500">
            <span className="flex items-center gap-2">🔒 Secure checkout via Stripe</span>
            <span className="hidden sm:block text-gray-200 dark:text-gray-700">·</span>
            <span className="flex items-center gap-2">⚡ Instant access after payment</span>
            <span className="hidden sm:block text-gray-200 dark:text-gray-700">·</span>
            <span className="flex items-center gap-2">💸 Less than one late add/drop fee ($30)</span>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────── */}
      <section className="py-24 bg-miami-red relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -bottom-16 -right-16 w-64 h-64 bg-white/5 rounded-full" />
          <div className="absolute -top-8 -left-8 w-48 h-48 bg-white/5 rounded-full" />
        </div>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center relative">
          <h2 className="text-4xl sm:text-5xl font-extrabold text-white mb-6 leading-tight">
            Registration opens soon.<br />Be ready.
          </h2>
          <p className="text-red-200 text-lg mb-10 leading-relaxed">
            Stop scrambling the night before. Build your perfect schedule now — before the seats fill up and the good sections are gone.
          </p>
          <Link to="/onboarding" className="inline-block bg-white text-miami-red font-bold py-4 px-10 rounded-xl text-base hover:bg-red-50 transition-colors shadow-lg">
            Get my course recommendations →
          </Link>
          <p className="text-red-300 text-sm mt-4">3 picks free · No account needed · Takes 2 minutes</p>
        </div>
      </section>
    </div>
  )
}
