/**
 * Miami University Course Catalog Scraper
 *
 * Primary source:  bulletin.miamioh.edu  (course catalog — static, no auth)
 * Section source:  apps.miamioh.edu/courselist (requires JS rendering — stubbed for now,
 *                  replace fetchSections() with a Puppeteer call when ready)
 *
 * Run: node server/scraper/index.js
 */

const https  = require('https')
const path   = require('path')
const { getDb, initDb } = require('../db/setup')

// ── Helpers ──────────────────────────────────────────────────────────────────

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'RegisterBuddy/1.0' } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return get(res.headers.location).then(resolve).catch(reject)
      }
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve(data))
      res.on('error', reject)
    }).on('error', reject)
  })
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#?\w+;/g, '')
    .replace(/\s+/g, ' ').trim()
}

// ── Bulletin departments ──────────────────────────────────────────────────────

const DEPARTMENTS = [
  { name: 'Accountancy',                         code: 'ACC' },
  { name: 'American Studies',                    code: 'AMS' },
  { name: 'Anthropology',                        code: 'ATH' },
  { name: 'Architecture & Interior Design',      code: 'ARC' },
  { name: 'Art',                                 code: 'ART' },
  { name: 'Biology',                             code: 'BIO' },
  { name: 'Business Legal Studies',              code: 'BLS' },
  { name: 'Chemistry & Biochemistry',            code: 'CHM' },
  { name: 'Chinese',                             code: 'CHI' },
  { name: 'Classics',                            code: 'CLS' },
  { name: 'Computer Science & Software Eng.',    code: 'CSE' },
  { name: 'Economics',                           code: 'ECO' },
  { name: 'Electrical & Computer Engineering',   code: 'ECE' },
  { name: 'English',                             code: 'ENG' },
  { name: 'Entrepreneurship',                    code: 'ESP' },
  { name: 'Finance',                             code: 'FIN' },
  { name: 'French',                              code: 'FRE' },
  { name: 'Geography',                           code: 'GEO' },
  { name: 'Geology',                             code: 'GLG' },
  { name: 'German',                              code: 'GER' },
  { name: 'Global & Intercultural Studies',      code: 'GIC' },
  { name: 'History',                             code: 'HST' },
  { name: 'Information Systems & Analytics',     code: 'ISA' },
  { name: 'Italian',                             code: 'ITL' },
  { name: 'Japanese',                            code: 'JPN' },
  { name: 'Journalism',                          code: 'JRN' },
  { name: 'Kinesiology, Nutrition & Health',     code: 'KNH' },
  { name: 'Management',                          code: 'MGT' },
  { name: 'Marketing',                           code: 'MKT' },
  { name: 'Mathematics',                         code: 'MTH' },
  { name: 'Mechanical & Manufacturing Eng.',     code: 'MME' },
  { name: 'Microbiology',                        code: 'MBI' },
  { name: 'Music',                               code: 'MUS' },
  { name: 'Nursing',                             code: 'NSG' },
  { name: 'Philosophy',                          code: 'PHL' },
  { name: 'Physics',                             code: 'PHY' },
  { name: 'Political Science',                   code: 'POL' },
  { name: 'Psychology',                          code: 'PSY' },
  { name: 'Religion',                            code: 'REL' },
  { name: 'Sociology',                           code: 'SOC' },
  { name: 'Spanish',                             code: 'SPN' },
  { name: 'Speech Pathology & Audiology',        code: 'SPA' },
  { name: 'Sport Leadership & Management',       code: 'SLM' },
  { name: 'Statistics',                          code: 'STA' },
  { name: 'Strategic Communication',             code: 'STC' },
  { name: 'Theatre',                             code: 'THE' },
  { name: "Women's, Gender & Sexuality Studies", code: 'WGS' },
]

// ── Parse bulletin page for a single department ───────────────────────────────

function parseBulletinPage(html, deptCode, deptName) {
  const courses = []
  const text = stripHtml(html)

  const codeRe = new RegExp(
    `(${deptCode}\\s+\\d{3}[A-Z]?(?:\\/\\d{3}[A-Z]?)?)\\s*\\.\\s*([^.(]+?)\\s*\\.\\s*\\((\\d[^)]*?)\\)`,
    'gi'
  )

  let match
  while ((match = codeRe.exec(text)) !== null) {
    const rawCode = match[1].replace(/\s+/, ' ').trim().toUpperCase()
    const primaryCode = rawCode.includes('/') ? rawCode.split('/')[0].trim() : rawCode
    const name = match[2].trim()
    const creditsRaw = match[3].trim()

    const num = parseInt(primaryCode.match(/\d+/)?.[0] || '0')
    if (num >= 600) continue
    if (/independent stud|internship|doctoral research|non-thesis/i.test(name)) continue

    const credits = creditsRaw.includes('-')
      ? parseInt(creditsRaw.split('-')[0]) || null
      : parseInt(creditsRaw) || null

    const headerEnd = match.index + match[0].length
    const snippet = text.slice(headerEnd, headerEnd + 250).trim()
    const description = snippet.split(/\.\s/)[0].replace(/\s+/g, ' ').trim()

    const parts = primaryCode.split(' ')
    courses.push({
      code:        primaryCode,
      subject:     parts[0],
      number:      parts[1] || '',
      name,
      credits,
      department:  deptName,
      description: description.length > 15 ? description : null,
      level:       num >= 400 ? 'upper' : num >= 200 ? 'mid' : 'intro',
    })
  }

  return courses
}

// ── Scrape catalog from bulletin ──────────────────────────────────────────────

async function scrapeCatalog() {
  console.log(`\nScraping bulletin for ${DEPARTMENTS.length} departments...`)
  const all = []

  for (let i = 0; i < DEPARTMENTS.length; i++) {
    const dept = DEPARTMENTS[i]
    const url = `https://bulletin.miamioh.edu/courses-instruction/${dept.code.toLowerCase()}/`
    process.stdout.write(`  [${i + 1}/${DEPARTMENTS.length}] ${dept.code}... `)
    try {
      const html = await get(url)
      const courses = parseBulletinPage(html, dept.code, dept.name)
      all.push(...courses)
      console.log(`${courses.length} courses`)
    } catch (e) {
      console.log(`ERROR: ${e.message}`)
    }
    if (i < DEPARTMENTS.length - 1) await sleep(250)
  }

  return all
}

// ── Seed catalog into DB ──────────────────────────────────────────────────────

function seedCatalog(courses) {
  const db = getDb()
  db.exec('DELETE FROM courses')

  const insert = db.prepare(`
    INSERT INTO courses (code, subject, number, name, credits, department, description, level)
    VALUES (@code, @subject, @number, @name, @credits, @department, @description, @level)
  `)

  const insertMany = db.transaction(list => {
    for (const c of list) insert.run(c)
  })

  insertMany(courses)
  const count = db.prepare('SELECT COUNT(*) as n FROM courses').get().n
  console.log(`\n✅ Seeded ${count} courses into DB`)
  db.close()
}

// ── Generate realistic sections from catalog ─────────────────────────────────
// Used until we can scrape live section data from apps.miamioh.edu

const INSTRUCTORS = {
  CSE: ['Dr. Alan Hayes', 'Dr. Marcus Webb', 'Prof. Lisa Park', 'Dr. Sophia Chen', 'Dr. Kevin Tran'],
  MTH: ['Dr. Priya Patel', 'Dr. James Okafor', 'Prof. Sarah Kim', 'Dr. David Liu', 'Dr. Amy Foster'],
  ENG: ['Prof. Susan Liang', 'Dr. Robert Chen', 'Prof. Maria Torres', 'Dr. Emily Davis'],
  PSY: ['Dr. Jennifer Walsh', 'Prof. Brian Scott', 'Dr. Laura Chen', 'Dr. Michael Brown'],
  BIO: ['Dr. Thomas Reed', 'Prof. Karen White', 'Dr. Nicole Martinez', 'Dr. Paul Green'],
  CHM: ['Dr. Sandra Hill', 'Prof. Alex Johnson', 'Dr. Rachel Evans', 'Dr. Chris Moore'],
  ACC: ['Dr. Rebecca Torres', 'Prof. David Park', 'Dr. Nancy Kim', 'Dr. Steve Adams'],
  ECO: ['Dr. Angela Ross', 'Prof. John Miller', 'Dr. Diane Cooper', 'Dr. Mark Wilson'],
  MGT: ['Dr. Rebecca Torres', 'Prof. Ken Davis', 'Dr. Lisa Brown', 'Dr. Tom White'],
  MKT: ['Prof. Jennifer Walsh', 'Dr. Carlos Rivera', 'Prof. Amy Chen'],
  FIN: ['Dr. Michael Grant', 'Prof. Sarah Jones', 'Dr. Robert Kim'],
  SOC: ['Dr. Patricia Hill', 'Prof. Carlos Martin', 'Dr. Rachel Green'],
  POL: ['Dr. Samuel Taylor', 'Prof. Diana Ross', 'Dr. Kevin Park'],
  STA: ['Dr. James Okafor', 'Prof. Wei Zhang', 'Dr. Susan Foster'],
  PHY: ['Dr. Richard Davis', 'Prof. Linda Park', 'Dr. Ahmad Hassan'],
  DEFAULT: ['Prof. Staff', 'Dr. Faculty', 'Prof. TBA'],
}

const SCHEDULES = [
  { days: 'MWF', times: [['08:00', '08:50'], ['09:00', '09:50'], ['10:00', '10:50'], ['11:00', '11:50'], ['12:00', '12:50'], ['01:00', '01:50'], ['02:00', '02:50']] },
  { days: 'TR',  times: [['08:00', '09:15'], ['09:30', '10:45'], ['11:00', '12:15'], ['12:30', '01:45'], ['02:00', '03:15'], ['03:30', '04:45']] },
  { days: 'MW',  times: [['04:00', '05:15'], ['05:30', '06:45']] },
]

const ROOMS = ['Benton 215', 'Bachelor 018', 'Laws 112', 'Upham 102', 'Farmer 0010', 'Shideler 152', 'Harrison 202', 'Boyd 216']
const CURRENT_TERM = '202710'  // Fall 2026 (academic year 2026-27)
const TERM_LABEL  = 'Fall 2026'

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }
function seededRandom(seed) {
  let s = seed
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280 }
}

function generateSections(courses) {
  const sections = []
  let crn = 10001

  for (const course of courses) {
    const rng = seededRandom(course.code.split('').reduce((a, c) => a + c.charCodeAt(0), 0))
    const numSections = course.level === 'intro' ? randInt(2, 4) : randInt(1, 2)
    const instructorPool = INSTRUCTORS[course.subject] || INSTRUCTORS.DEFAULT

    for (let s = 0; s < numSections; s++) {
      const schedGroup = SCHEDULES[Math.floor(rng() * SCHEDULES.length)]
      const timeSlot  = schedGroup.times[Math.floor(rng() * schedGroup.times.length)]
      const total     = course.level === 'intro' ? randInt(25, 45) : randInt(18, 30)
      const avail     = Math.floor(rng() * total)
      const instructor = instructorPool[Math.floor(rng() * instructorPool.length)]
      const rmpScore  = +(3.2 + rng() * 1.8).toFixed(1)

      const fmt = t => {
        const [h, m] = t.split(':').map(Number)
        const ampm = h >= 12 ? 'pm' : 'am'
        const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h
        return `${h12}:${m.toString().padStart(2, '0')}${ampm}`
      }

      sections.push({
        crn:        String(crn++),
        code:       course.code,
        term:       CURRENT_TERM,
        term_label: TERM_LABEL,
        section:    String.fromCharCode(65 + s),
        instructor,
        rmp_score:  rmpScore,
        days:       schedGroup.days,
        start_time: timeSlot[0],
        end_time:   timeSlot[1],
        schedule:   `${schedGroup.days} ${fmt(timeSlot[0])}–${fmt(timeSlot[1])}`,
        room:       pickRandom(ROOMS),
        campus:     'Oxford',
        seats_total: total,
        seats_avail: avail,
        waitlist:   avail === 0 ? randInt(0, 8) : 0,
        credits:    course.credits,
        delivery:   rng() > 0.85 ? 'online-sync' : 'face-to-face',
      })
    }
  }

  return sections
}

function seedSections(sections) {
  const db = getDb()
  db.exec('DELETE FROM sections')

  // Get course id lookup
  const courseIds = {}
  for (const r of db.prepare('SELECT id, code FROM courses').all()) {
    courseIds[r.code] = r.id
  }

  const insert = db.prepare(`
    INSERT INTO sections
      (crn, course_id, code, term, term_label, section, instructor, rmp_score,
       days, start_time, end_time, schedule, room, campus, seats_total, seats_avail,
       waitlist, credits, delivery)
    VALUES
      (@crn, @course_id, @code, @term, @term_label, @section, @instructor, @rmp_score,
       @days, @start_time, @end_time, @schedule, @room, @campus, @seats_total, @seats_avail,
       @waitlist, @credits, @delivery)
  `)

  const insertMany = db.transaction(list => {
    for (const s of list) insert.run({ ...s, course_id: courseIds[s.code] || null })
  })

  insertMany(sections)
  const count = db.prepare('SELECT COUNT(*) as n FROM sections').get().n
  console.log(`✅ Seeded ${count} sections for term ${CURRENT_TERM}`)
  db.close()
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log('🚀 RegisterBuddy catalog scraper starting...')
  initDb()

  const catalog = await scrapeCatalog()
  seedCatalog(catalog)

  console.log('\nGenerating sections...')
  const sections = generateSections(catalog)
  seedSections(sections)

  console.log('\n✅ Scrape complete.')
  console.log(`   ${catalog.length} courses · ${sections.length} sections · term ${CURRENT_TERM}`)
}

if (require.main === module) {
  run().catch(e => { console.error(e); process.exit(1) })
}

module.exports = { run, scrapeCatalog, generateSections }
