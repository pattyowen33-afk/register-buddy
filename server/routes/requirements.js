/**
 * GET /api/requirements
 *
 * Returns degree requirements, Miami Plan status, and gap analysis
 * for a given student profile.
 *
 * Query params:
 *   major             — e.g. "Computer Science"
 *   completedCourses  — comma-separated list of codes, e.g. "CSE 148,MTH 151"
 *   planVersion       — "NMP" (2023+) | "GMP" (pre-2023)  [optional, auto-detected]
 *   year              — freshman | sophomore | junior | senior  [optional]
 *   term              — term code for available sections  [optional, defaults to current]
 *
 * Returns:
 *   { planVersion, miamiPlan, major, summary, availableMajors, thematicSequences }
 */

const express                          = require('express')
const { getDb }                        = require('../db/setup')
const { analyzeGaps, AVAILABLE_MINORS } = require('../lib/requirementGap')
const MIAMI_PLAN                       = require('../data/miamiPlan.json')
const MAJOR_REQ                        = require('../data/majorRequirements.json')

const router = express.Router()

// Pre-computed list of available majors (for onboarding dropdown)
const AVAILABLE_MAJORS = Object.keys(MAJOR_REQ).filter(k => !k.startsWith('_')).sort()

router.get('/', (req, res) => {
  try {
    const {
      major            = '',
      minor            = '',
      completedCourses = '',
      planVersion      = '',
      year             = '',
      term             = '',
    } = req.query

    // If no major provided, return just the metadata (majors list + plan info)
    if (!major) {
      return res.json({
        availableMajors:   AVAILABLE_MAJORS,
        availableMinors:   AVAILABLE_MINORS,
        thematicSequences: MIAMI_PLAN.thematicSequences,
        planVersions: {
          NMP: { label: MIAMI_PLAN.NMP.label, appliesTo: MIAMI_PLAN.NMP.appliesTo },
          GMP: { label: MIAMI_PLAN.GMP.label, appliesTo: MIAMI_PLAN.GMP.appliesTo },
        },
      })
    }

    // Parse completed courses from comma-separated string
    const completed = completedCourses
      ? completedCourses.split(',').map(c => c.trim().toUpperCase()).filter(Boolean)
      : []

    // ── Fetch available sections from DB ─────────────────────────────────────
    const db = getDb()

    // Sanitise term param (digits only) to prevent injection
    const safeTerm  = (term || '').replace(/[^0-9]/g, '')
    const termClause = safeTerm
      ? `AND s.term = '${safeTerm}'`
      : `AND s.term = (SELECT MAX(term) FROM sections)`

    const availableSections = db.prepare(`
      SELECT
        c.code, c.name, c.credits, c.subject, c.number, c.level, c.description,
        s.crn, s.section, s.schedule, s.days, s.start_time, s.end_time,
        s.seats_avail, s.seats_total, s.delivery, s.room, s.campus,
        s.instructor, s.term, s.term_label
      FROM sections s
      JOIN courses c ON c.code = s.code
      WHERE s.campus = 'Oxford'
        ${termClause}
      ORDER BY c.subject, CAST(c.number AS INTEGER)
    `).all()

    db.close()

    // ── Run gap analysis ─────────────────────────────────────────────────────
    const gapResult = analyzeGaps({
      major,
      minor:             minor        || undefined,
      completedCourses:  completed,
      availableSections,
      planVersion:       planVersion  || undefined,
      year:              year         || undefined,
    })

    // ── Respond ──────────────────────────────────────────────────────────────
    res.json({
      ...gapResult,
      availableMajors:   AVAILABLE_MAJORS,
      availableMinors:   AVAILABLE_MINORS,
      thematicSequences: MIAMI_PLAN.thematicSequences,
    })

  } catch (err) {
    console.error('/api/requirements error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
