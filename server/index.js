require('dotenv').config({ path: require('path').join(__dirname, '.env'), override: true })

const express = require('express')
const cors    = require('cors')
const path    = require('path')
const { initDb } = require('./db/setup')

const app  = express()
const PORT = process.env.PORT || 3001

// ── Middleware ────────────────────────────────────────────────────────────────

// In production Railway deploys, Express serves the built Vite frontend too
const isProd = process.env.NODE_ENV === 'production'

app.use(cors({
  origin: isProd
    ? [process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '*', process.env.FRONTEND_URL].filter(Boolean)
    : ['http://localhost:5173', 'http://localhost:4173', process.env.FRONTEND_URL].filter(Boolean),
  credentials: true,
}))
app.use(express.json({ limit: '2mb' }))

// ── Routes ────────────────────────────────────────────────────────────────────

app.use('/api/courses',      require('./routes/courses'))
app.use('/api/requirements', require('./routes/requirements'))
app.use('/api/recommend',    require('./routes/recommend'))
app.use('/api/schedule',     require('./routes/scheduleAI'))
app.use('/api/email',        require('./routes/email'))
app.use('/api/roger',        require('./routes/roger'))
app.use('/api/stripe',       require('./routes/stripe'))

app.get('/api/health', (req, res) => {
  const { getDb } = require('./db/setup')
  let dbStatus = 'ok'
  let courseCount = 0
  let sectionCount = 0
  try {
    const db = getDb()
    courseCount  = db.prepare('SELECT COUNT(*) as n FROM courses').get().n
    sectionCount = db.prepare('SELECT COUNT(*) as n FROM sections').get().n
    db.close()
  } catch (e) {
    dbStatus = e.message
  }

  res.json({
    status:   'ok',
    version:  '1.0.0',
    db:       dbStatus,
    courses:  courseCount,
    sections: sectionCount,
    uptime:   process.uptime(),
    ts:       new Date().toISOString(),
  })
})

// ── Serve built frontend in production ───────────────────────────────────────

if (isProd) {
  const distPath = path.join(__dirname, '../dist')
  app.use(express.static(distPath))
  // All non-API routes return the React app (client-side routing)
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'))
    }
  })
}

// ── DB init on startup ────────────────────────────────────────────────────────

try {
  initDb()
} catch (e) {
  console.warn('DB init warning:', e.message)
}

// Start cron scheduler (won't run unless DB is seeded)
try {
  require('./scraper/schedule').startScheduler()
} catch (e) {
  console.warn('Scheduler not started:', e.message)
}

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚀 RegisterBuddy API running on http://localhost:${PORT}`)
  console.log(`   GET  /api/health`)
  console.log(`   GET  /api/courses?search=calc&subject=MTH`)
  console.log(`   GET  /api/requirements?major=Computer+Science`)
  console.log(`   POST /api/recommend`)
  console.log(`   POST /api/email/capture`)
  console.log(`   POST /api/email/retention`)
  console.log(`\n   Run "npm run scrape" first if DB is empty.\n`)
})
