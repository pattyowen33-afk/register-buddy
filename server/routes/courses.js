const express = require('express')
const { getDb } = require('../db/setup')

const router = express.Router()

/**
 * GET /api/courses
 * Query params:
 *   search   — text search on code/name/description
 *   subject  — department code filter (CSE, MTH, etc.)
 *   term     — term code (default: latest)
 *   level    — intro | mid | upper
 *   open     — "true" to only show open sections
 *   limit    — max results (default 50)
 *   offset   — pagination offset (default 0)
 */
router.get('/', (req, res) => {
  try {
    const db = getDb()
    const {
      search = '',
      subject = '',
      term = '',
      level = '',
      open = '',
      limit = '50',
      offset = '0',
    } = req.query

    let where = []
    let params = {}

    if (search) {
      where.push(`(c.code LIKE @search OR c.name LIKE @search OR c.description LIKE @search)`)
      params.search = `%${search}%`
    }
    if (subject) {
      where.push(`c.subject = @subject`)
      params.subject = subject.toUpperCase()
    }
    if (level) {
      where.push(`c.level = @level`)
      params.level = level
    }

    // Join with sections to get live availability
    const termClause = term ? `AND s.term = @term` : ''
    if (term) params.term = term
    if (open === 'true') where.push(`s.seats_avail > 0`)

    const whereStr = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const sql = `
      SELECT
        c.id, c.code, c.subject, c.number, c.name, c.credits,
        c.department, c.description, c.level,
        s.crn, s.section, s.instructor, s.rmp_score,
        s.days, s.start_time, s.end_time, s.schedule, s.room,
        s.seats_total, s.seats_avail, s.waitlist,
        s.term, s.term_label, s.delivery
      FROM courses c
      LEFT JOIN sections s ON s.code = c.code ${termClause}
      ${whereStr}
      ORDER BY c.subject, CAST(c.number AS INTEGER)
      LIMIT @limit OFFSET @offset
    `

    const rows = db.prepare(sql).all({
      ...params,
      limit: parseInt(limit),
      offset: parseInt(offset),
    })

    const total = db.prepare(`
      SELECT COUNT(DISTINCT c.id) as n
      FROM courses c
      LEFT JOIN sections s ON s.code = c.code ${termClause}
      ${whereStr}
    `).get(params)?.n ?? 0

    db.close()
    res.json({ courses: rows, total, limit: parseInt(limit), offset: parseInt(offset) })
  } catch (err) {
    console.error('/api/courses error:', err)
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/courses/:code
 * Get a single course + all its sections
 */
router.get('/:code', (req, res) => {
  try {
    const db = getDb()
    const code = req.params.code.toUpperCase().replace('-', ' ')

    const course = db.prepare(`SELECT * FROM courses WHERE code = ?`).get(code)
    if (!course) { db.close(); return res.status(404).json({ error: 'Course not found' }) }

    const sections = db.prepare(`SELECT * FROM sections WHERE code = ? ORDER BY term DESC, section`).all(code)
    db.close()
    res.json({ ...course, sections })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
