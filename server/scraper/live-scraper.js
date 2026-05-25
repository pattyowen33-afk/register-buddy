/**
 * Miami University Live Section Scraper
 *
 * Scrapes real section data from apps.miamioh.edu/courselist using Puppeteer.
 * Replaces the seeded-random section generator with actual CRNs, instructors,
 * enrollment counts, meeting times, and room assignments.
 *
 * Run standalone: node server/scraper/live-scraper.js
 * Or called from: server/scraper/index.js (weekly cron)
 */

const puppeteer = require('puppeteer')
const cheerio   = require('cheerio')
const path      = require('path')
const { getDb } = require('../db/setup')

// ── Constants ──────────────────────────────────────────────────────────────────

const BASE_URL    = 'https://www.apps.miamioh.edu/courselist/'
const TERM_CODE   = '202710'   // Fall Semester 2026-27
const TERM_LABEL  = 'Fall 2026'
const CAMPUS      = 'O'        // Oxford main campus only

// All subject codes we care about (must match bulletin scraper)
const SUBJECTS = [
  'ACC','AMS','ATH','ARC','ART','BIO','BLS','CHM','CHI','CLS',
  'CSE','ECO','ECE','ENG','ESP','FIN','FRE','GEO','GLG','GER',
  'GIC','HST','ISA','ITL','JPN','JRN','KNH','MGT','MKT','MTH',
  'MME','MBI','MUS','NSG','PHL','PHY','POL','PSY','REL','SOC',
  'SPN','SPA','SLM','STA','STC','THE','WGS',
]

// ── HTML Parser ────────────────────────────────────────────────────────────────

/**
 * Parse the results HTML and return an array of section objects.
 * Table columns (0-indexed):
 *   0: Subject
 *   1: Number
 *   2: Title
 *   3: Section letter
 *   4: CRN
 *   5: Campus
 *   6: Credit Hours
 *   7: Enrollment/Capacity  (e.g. "12/30")
 *   8: Delivery
 *   9: Schedule block  (days + time + room + date range)
 */
function parseSections(html, term, termLabel) {
  const $ = cheerio.load(html)
  const sections = []

  $('#resultsTable tbody tr.resultrow').each((_, row) => {
    const cells = $(row).find('td')
    if (cells.length < 9) return

    const subject    = $(cells[0]).text().replace(/Show Details[\s\S]*/i, '').trim()
    const number     = $(cells[1]).text().trim()
    const title      = $(cells[2]).text().trim()
    const section    = $(cells[3]).text().trim()
    const crn        = $(cells[4]).text().trim()
    const campus     = $(cells[5]).text().trim()
    const creditRaw  = $(cells[6]).text().trim()
    const enrollRaw  = $(cells[7]).text().trim()   // "12/30"
    const delivery   = $(cells[8]).text().trim()
    const schedRaw   = cells.length > 9 ? $(cells[9]).text().trim() : ''

    if (!crn || !subject || !number) return

    // Parse enrollment
    const enrollParts = enrollRaw.split('/')
    const enrolled   = parseInt(enrollParts[0]) || 0
    const capacity   = parseInt(enrollParts[1]) || 0
    const seatsAvail = Math.max(0, capacity - enrolled)

    // Parse schedule (whitespace-delimited, may have multiple meetings)
    const { days, startTime, endTime, room, schedule } = parseSchedule(schedRaw)

    // Credits
    const credits = parseFloat(creditRaw) || null

    // Delivery normalization
    const deliveryNorm = normalizeDelivery(delivery)

    const code = `${subject} ${number}`

    sections.push({
      crn,
      code,
      term,
      term_label:   termLabel,
      section:      section.replace(/\s+/g, ''),
      instructor:   null,       // loaded via detail AJAX — populated separately if needed
      rmp_score:    null,
      days,
      start_time:   startTime,
      end_time:     endTime,
      schedule,
      room,
      campus,
      seats_total:  capacity,
      seats_avail:  seatsAvail,
      waitlist:     0,
      credits,
      delivery:     deliveryNorm,
    })
  })

  return sections
}

function parseSchedule(raw) {
  // raw looks like:  "MWF\n  10:05am-11:00am\nUPH 106\n08/24 - 12/11"
  // or online:       "Online Asynchronous"
  // or TBA:          "TBA"

  const text = raw.replace(/\s+/g, ' ').trim()
  if (!text || /tba|online async|arranged/i.test(text)) {
    return { days: null, startTime: null, endTime: null, room: null, schedule: text || null }
  }

  // Match days pattern: M T W R F U S (any combo)
  const daysMatch = text.match(/^([MTWRFUS]{1,7})\s/)
  const days = daysMatch ? daysMatch[1] : null

  // Match time: 9:00am-10:15am
  const timeMatch = text.match(/(\d{1,2}:\d{2}[ap]m)-(\d{1,2}:\d{2}[ap]m)/i)
  const startTime = timeMatch ? to24h(timeMatch[1]) : null
  const endTime   = timeMatch ? to24h(timeMatch[2]) : null

  // Room: anything after the time that looks like a building code
  let room = null
  if (timeMatch) {
    const afterTime = text.slice(text.indexOf(timeMatch[0]) + timeMatch[0].length).trim()
    // Room is before the date range (MM/DD - MM/DD)
    const roomMatch = afterTime.match(/^([A-Z][A-Z0-9 ]{1,15})\s+\d{2}\/\d{2}/)
    if (roomMatch) room = roomMatch[1].trim()
  }

  // Human-readable schedule
  let schedule = null
  if (days && startTime && endTime) {
    schedule = `${days} ${fmt12(startTime)}–${fmt12(endTime)}`
    if (room) schedule += ` ${room}`
  } else {
    schedule = text.split(/\d{2}\/\d{2}/)[0].trim() || null
  }

  return { days, startTime, endTime, room, schedule }
}

function to24h(t) {
  const m = t.match(/(\d{1,2}):(\d{2})(am|pm)/i)
  if (!m) return null
  let h = parseInt(m[1]), min = m[2], ampm = m[3].toLowerCase()
  if (ampm === 'pm' && h < 12) h += 12
  if (ampm === 'am' && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${min}`
}

function fmt12(t24) {
  if (!t24) return ''
  const [h, m] = t24.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(m).padStart(2, '0')}${ampm}`
}

function normalizeDelivery(raw) {
  const r = (raw || '').toLowerCase()
  if (r.includes('async'))  return 'online-async'
  if (r.includes('sync'))   return 'online-sync'
  if (r.includes('online')) return 'online-async'
  if (r.includes('hybrid')) return 'hybrid'
  if (r.includes('face'))   return 'face-to-face'
  if (r.includes('person')) return 'face-to-face'
  return 'face-to-face'
}

// ── Browser Fetcher ────────────────────────────────────────────────────────────

async function fetchSubjectSections(page, term, subject) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 })

  // Use jQuery to set form values and trigger change events
  await page.evaluate((term, subject) => {
    $('#termFilter').val(term).trigger('change')

    // Campus: Oxford only
    const campusSel = document.getElementById('campusFilter')
    for (const opt of campusSel.options) {
      opt.selected = opt.value === 'O'
    }
    // If 'O' not found, fall back to All
    if (![...campusSel.options].some(o => o.selected)) {
      campusSel.options[0].selected = true
    }
    $('#campusFilter').trigger('change')

    // Subject
    const subjectSel = document.getElementById('subject')
    for (const opt of subjectSel.options) {
      opt.selected = opt.value === subject
    }
    $('#subject').trigger('change')

    // Undergraduate only
    document.getElementById('levelFilter').value = 'UG'
  }, term, subject)

  await new Promise(r => setTimeout(r, 500))

  // Ensure submit button is enabled and submit form
  await page.evaluate(() => {
    const btn = document.getElementById('courseSearch')
    if (btn) { btn.disabled = false; btn.removeAttribute('disabled') }
    document.getElementById('searchForm').submit()
  })

  // Wait for page to reload with results
  try {
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 })
  } catch {
    await new Promise(r => setTimeout(r, 5000))
  }

  const html = await page.content()
  const sections = parseSections(html, term, TERM_LABEL)
  return sections
}

// ── DB Seeding ─────────────────────────────────────────────────────────────────

function seedLiveSections(sections) {
  const db = getDb()

  // Load course code → id lookup
  const courseIds = {}
  for (const r of db.prepare('SELECT id, code FROM courses').all()) {
    courseIds[r.code] = r.id
  }

  // Remove only existing sections for this term
  db.prepare('DELETE FROM sections WHERE term = ?').run(TERM_CODE)

  const insert = db.prepare(`
    INSERT OR REPLACE INTO sections
      (crn, course_id, code, term, term_label, section, instructor, rmp_score,
       days, start_time, end_time, schedule, room, campus, seats_total, seats_avail,
       waitlist, credits, delivery)
    VALUES
      (@crn, @course_id, @code, @term, @term_label, @section, @instructor, @rmp_score,
       @days, @start_time, @end_time, @schedule, @room, @campus, @seats_total, @seats_avail,
       @waitlist, @credits, @delivery)
  `)

  const insertMany = db.transaction(list => {
    for (const s of list) {
      insert.run({ ...s, course_id: courseIds[s.code] || null })
    }
  })

  insertMany(sections)

  const count = db.prepare('SELECT COUNT(*) as n FROM sections WHERE term = ?').get(TERM_CODE).n
  db.close()
  return count
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function scrapeAllSections() {
  console.log(`\n🔍 Scraping live sections from Miami courselist...`)
  console.log(`   Term: ${TERM_LABEL} (${TERM_CODE})`)
  console.log(`   Subjects: ${SUBJECTS.length}\n`)

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })

  const allSections = []
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900 })
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36')

  // Suppress non-critical resource loading for speed
  await page.setRequestInterception(true)
  page.on('request', req => {
    const type = req.resourceType()
    if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
      req.abort()
    } else {
      req.continue()
    }
  })

  try {
    for (let i = 0; i < SUBJECTS.length; i++) {
      const subject = SUBJECTS[i]
      process.stdout.write(`  [${i + 1}/${SUBJECTS.length}] ${subject}... `)

      try {
        const sections = await fetchSubjectSections(page, TERM_CODE, subject)
        allSections.push(...sections)
        console.log(`${sections.length} sections`)
      } catch (e) {
        console.log(`ERROR: ${e.message.slice(0, 80)}`)
      }

      // Polite delay between requests
      if (i < SUBJECTS.length - 1) await new Promise(r => setTimeout(r, 1000))
    }
  } finally {
    await browser.close()
  }

  console.log(`\nTotal sections scraped: ${allSections.length}`)
  return allSections
}

async function run() {
  const sections = await scrapeAllSections()

  if (sections.length === 0) {
    console.log('❌ No sections scraped — aborting DB update')
    return
  }

  console.log('\nSaving to database...')
  const count = seedLiveSections(sections)
  console.log(`✅ Saved ${count} live sections for ${TERM_LABEL}`)
}

if (require.main === module) {
  run().catch(e => { console.error(e); process.exit(1) })
}

module.exports = { scrapeAllSections, parseSections, seedLiveSections }
