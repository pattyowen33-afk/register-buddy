/**
 * majorCurriculum.js
 *
 * Single source of truth for what courses are appropriate for each major track.
 *
 * The core insight: the same GE "math" requirement is satisfied differently
 * by different tracks. A business student taking MTH 141 is DONE with math —
 * they should never see MTH 151, 251, 252, 222, or 231. A CS student NEEDS
 * MTH 151 as the foundation of their whole program.
 *
 * This file drives:
 *   - recommend.js  → filters and re-scores based on track fitness
 *   - scheduleAI.js → tells the AI which courses are appropriate to pick
 */

// ── Track definitions ─────────────────────────────────────────────────────────
// Group majors into broad academic tracks that share math/science/GE paths

const MAJOR_TO_TRACK = {
  // ── Business track — MTH 141, STA 261, business core ──────────────────────
  'Accounting':                               'BUSINESS',
  'Business Analytics':                       'BUSINESS',
  'Data Analytics':                           'BUSINESS',
  'Entrepreneurship':                         'BUSINESS',
  'Finance':                                  'BUSINESS',
  'Human Capital Management and Leadership':  'BUSINESS',
  'Information Systems':                      'BUSINESS',
  'Information Systems & Analytics':          'BUSINESS',
  'Information Systems and Cybersecurity Management': 'BUSINESS',
  'International Business':                   'BUSINESS',
  'Management':                               'BUSINESS',
  'Marketing':                                'BUSINESS',
  'Real Estate':                              'BUSINESS',

  // ── CS / Software track — MTH 151, 251, 231, 222; PHY 181 ────────────────
  'Computer Science':                         'STEM_CS',
  'Computer Engineering':                     'STEM_CS',
  'Software Engineering':                     'STEM_CS',

  // ── Engineering track — MTH 151, 251, 252, 245; PHY 181, CHM 141 ─────────
  'Biomedical Engineering':                   'STEM_ENG',
  'Chemical Engineering':                     'STEM_ENG',
  'Civil Engineering':                        'STEM_ENG',
  'Electrical Engineering':                   'STEM_ENG',
  'Electrical & Computer Engineering':        'STEM_ENG',
  'Mechanical Engineering':                   'STEM_ENG',

  // ── Life/Physical science — BIO, CHM sequence; MTH 151 ───────────────────
  'Biochemistry':                             'STEM_SCI',
  'Biology':                                  'STEM_SCI',
  'Chemistry':                                'STEM_SCI',
  'Dietetics':                                'STEM_SCI',
  'Environmental Studies':                    'STEM_SCI',
  'Geology':                                  'STEM_SCI',
  'Microbiology':                             'STEM_SCI',
  'Neuroscience':                             'STEM_SCI',
  'Nursing':                                  'STEM_SCI',
  'Pre-Medicine':                             'STEM_SCI',
  'Zoology':                                  'STEM_SCI',

  // ── Physics/Math track — full calc sequence ───────────────────────────────
  'Mathematics':                              'STEM_MATH',
  'Physics':                                  'STEM_MATH',
  'Statistics':                               'STEM_MATH',

  // ── Social science track — STA 261, no heavy calc/lab science ────────────
  'Communication Sciences & Disorders':       'SOCIAL_SCI',
  'Criminal Justice':                         'SOCIAL_SCI',
  'Economics':                                'GENERAL',   // Miami Econ requires MTH 151
  'Geography':                                'SOCIAL_SCI',
  'Global & Intercultural Studies':           'SOCIAL_SCI',
  'International Studies':                    'SOCIAL_SCI',
  'Political Science':                        'SOCIAL_SCI',
  'Psychology':                               'SOCIAL_SCI',
  'Public Administration':                    'SOCIAL_SCI',
  'Social Studies Education':                 'SOCIAL_SCI',
  'Social Work':                              'SOCIAL_SCI',
  'Sociology':                                'SOCIAL_SCI',
  "Women's, Gender & Sexuality Studies":      'SOCIAL_SCI',

  // ── Humanities track — writing-heavy, minimal STEM ────────────────────────
  'Art History':                              'HUMANITIES',
  'Classical Humanities':                     'HUMANITIES',
  'Creative Writing':                         'HUMANITIES',
  'English':                                  'HUMANITIES',
  'French':                                   'HUMANITIES',
  'German':                                   'HUMANITIES',
  'History':                                  'HUMANITIES',
  'Interactive Media Studies':                'HUMANITIES',
  'Journalism':                               'HUMANITIES',
  'Linguistics':                              'HUMANITIES',
  'Media & Culture':                          'HUMANITIES',
  'Music':                                    'HUMANITIES',
  'Music Education':                          'HUMANITIES',
  'Philosophy':                               'HUMANITIES',
  'Spanish':                                  'HUMANITIES',
  'Speech Pathology & Audiology':             'HUMANITIES',
  'Strategic Communication':                  'HUMANITIES',
  'Theatre':                                  'HUMANITIES',

  // ── Health/Kinesiology — bio-based, not full pre-med ─────────────────────
  'Exercise Science':                         'HEALTH',
  'Kinesiology':                              'HEALTH',
  'Physical Education':                       'HEALTH',

  // ── Education ─────────────────────────────────────────────────────────────
  'Early Childhood Education':                'EDUCATION',
  'Integrated Mathematics Education':         'EDUCATION',
  'Middle Childhood Education':               'EDUCATION',
  'Special Education':                        'EDUCATION',

  // ── Design ────────────────────────────────────────────────────────────────
  'Architecture':                             'DESIGN',
  'Art Education':                            'DESIGN',
  'Communication Design':                     'DESIGN',

  // ── Pre-professional (advising tracks) ───────────────────────────────────
  'Pre-Law':                                  'GENERAL',
  'Pre-Medicine':                             'STEM_SCI',

  // ── Fallback ──────────────────────────────────────────────────────────────
  'Liberal Studies':                          'GENERAL',
  'Undecided / Exploring':                    'GENERAL',
}

// ── Track-level course rules ───────────────────────────────────────────────────

const TRACK_RULES = {
  BUSINESS: {
    // Business calculus IS the math track — never recommend the STEM calc sequence on top of it
    math_preferred:  ['MTH 141', 'STA 261', 'STA 301'],
    math_excluded:   ['MTH 151', 'MTH 251', 'MTH 252', 'MTH 222', 'MTH 231', 'MTH 245', 'MTH 125'],
    // Business students don't need engineering physics or lab chemistry
    science_excluded: ['PHY 181', 'PHY 182', 'CHM 141', 'CHM 142', 'CHM 241', 'CHM 242', 'BIO 161'],
    // CS courses beyond intro are not typical for business (MIS students are the exception)
    cs_excluded:     ['CSE 271', 'CSE 274', 'CSE 374', 'CSE 383', 'CSE 385', 'CSE 432', 'CSE 486'],
    // Business-specific high-value courses
    priority:        ['ACC 221', 'ACC 222', 'ECO 101', 'ECO 102', 'MGT 291', 'MKT 291', 'FIN 301', 'STA 261'],
    // Score penalty for wrong-track courses (applied multiplicatively)
    wrong_track_penalty: 40,
  },

  STEM_CS: {
    math_preferred:  ['MTH 151', 'MTH 251', 'MTH 252', 'MTH 231', 'MTH 222', 'STA 261', 'STA 301'],
    // CS students should never be recommended business calc — it won't satisfy their prereqs
    math_excluded:   ['MTH 141', 'MTH 125'],
    science_preferred: ['PHY 181', 'PHY 182'],
    priority:        ['CSE 174', 'CSE 271', 'CSE 274', 'CSE 383', 'CSE 385', 'CSE 374', 'MTH 151', 'MTH 231'],
    wrong_track_penalty: 35,
  },

  STEM_ENG: {
    math_preferred:  ['MTH 151', 'MTH 251', 'MTH 252', 'MTH 245'],
    math_excluded:   ['MTH 141', 'MTH 125', 'MTH 231', 'MTH 222'],
    science_preferred: ['PHY 181', 'PHY 182', 'CHM 141'],
    priority:        ['MTH 151', 'MTH 251', 'PHY 181', 'CHM 141'],
    wrong_track_penalty: 30,
  },

  STEM_SCI: {
    math_preferred:  ['MTH 151', 'STA 261'],
    math_excluded:   ['MTH 141', 'MTH 125', 'MTH 252', 'MTH 222', 'MTH 231'],
    science_preferred: ['BIO 115', 'BIO 116', 'CHM 141', 'CHM 142', 'CHM 241', 'PHY 181'],
    priority:        ['BIO 115', 'CHM 141', 'CHM 142', 'MTH 151', 'STA 261'],
    wrong_track_penalty: 25,
  },

  STEM_MATH: {
    math_preferred:  ['MTH 151', 'MTH 251', 'MTH 252', 'MTH 222', 'MTH 231', 'MTH 245', 'STA 261', 'STA 301'],
    math_excluded:   ['MTH 141', 'MTH 125'],
    science_preferred: ['PHY 181', 'PHY 182'],
    priority:        ['MTH 151', 'MTH 251', 'MTH 252', 'MTH 231', 'MTH 222', 'STA 261'],
    wrong_track_penalty: 30,
  },

  SOCIAL_SCI: {
    // Stats yes, heavy calc no
    math_preferred:  ['STA 261', 'STA 301', 'MTH 141'],
    math_excluded:   ['MTH 151', 'MTH 251', 'MTH 252', 'MTH 222', 'MTH 231', 'MTH 245'],
    // No lab sciences beyond intro GE options
    science_excluded: ['CHM 142', 'CHM 241', 'CHM 242', 'PHY 181', 'PHY 182', 'BIO 161'],
    cs_excluded:     ['CSE 271', 'CSE 274', 'CSE 374', 'CSE 383', 'CSE 432'],
    priority:        ['PSY 111', 'SOC 153', 'POL 141', 'ECO 101', 'ECO 102', 'STA 261'],
    wrong_track_penalty: 30,
  },

  HUMANITIES: {
    math_preferred:  ['STA 261', 'MTH 141'],
    math_excluded:   ['MTH 151', 'MTH 251', 'MTH 252', 'MTH 222', 'MTH 231', 'MTH 245'],
    science_excluded: ['CHM 141', 'CHM 142', 'CHM 241', 'PHY 181', 'PHY 182', 'BIO 161'],
    cs_excluded:     ['CSE 271', 'CSE 274', 'CSE 374', 'CSE 383', 'CSE 432'],
    priority:        ['ENG 111', 'ENG 112', 'ENG 201', 'HST 111', 'HST 112', 'PHL 131'],
    wrong_track_penalty: 30,
  },

  HEALTH: {
    math_preferred:  ['STA 261', 'MTH 151'],
    math_excluded:   ['MTH 252', 'MTH 222', 'MTH 231', 'MTH 245', 'MTH 141'],
    science_preferred: ['BIO 115', 'CHM 141', 'KNH 251'],
    priority:        ['BIO 115', 'CHM 141', 'PSY 111', 'STA 261', 'KNH 251'],
    wrong_track_penalty: 25,
  },

  EDUCATION: {
    math_preferred:  ['MTH 141', 'MTH 151', 'STA 261'],
    math_excluded:   ['MTH 252', 'MTH 222', 'MTH 245'],
    priority:        ['PSY 111', 'ENG 111', 'ENG 112', 'SOC 153'],
    wrong_track_penalty: 20,
  },

  DESIGN: {
    math_preferred:  ['STA 261', 'MTH 141'],
    math_excluded:   ['MTH 151', 'MTH 251', 'MTH 252', 'MTH 222', 'MTH 231'],
    priority:        ['ART 101', 'ENG 111', 'ENG 112'],
    wrong_track_penalty: 20,
  },

  GENERAL: {
    wrong_track_penalty: 0,
  },
}

// ── Equivalency groups ────────────────────────────────────────────────────────
// If a student has completed ANY course in a group, the others in that group
// should NOT be recommended to them (they've satisfied that tier of requirement).
//
// Format: { id, courses, tracks? }
// If `tracks` is set, the equivalency only applies to those tracks.

const EQUIVALENCY_GROUPS = [
  // Business math: MTH 141 is the end of the math road for business students.
  // If they took it, they are DONE. Don't suggest MTH 151 "for extra credit."
  {
    id: 'business_math',
    courses: ['MTH 141'],
    blocks: ['MTH 151', 'MTH 251', 'MTH 252', 'MTH 125'],
    tracks: ['BUSINESS', 'HUMANITIES', 'SOCIAL_SCI', 'EDUCATION'],
  },
  // Pre-calc: if they already took MTH 151 or MTH 141, pre-calc is pointless
  {
    id: 'precalc',
    courses: ['MTH 125'],
    blocks: [],  // MTH 125 → MTH 141 or MTH 151 is progression, not redundancy
  },
  // Statistics: STA 261 and STA 301 satisfy the same req at different levels.
  // If you have 301, you clearly don't need 261. If you have 261, 301 is an
  // optional upgrade — leave it in the pool as an elective, not a requirement.
  {
    id: 'stats_req',
    courses: ['STA 261', 'STA 301'],
    blocks: [], // These are a sequence, not true equivalents — handled separately
  },
  // English composition: ENG 111 is prerequisite to everything else; if done, done.
  {
    id: 'english_comp',
    courses: ['ENG 111'],
    blocks: [],
  },
  // Intro biology: BIO 115 (ecology) and BIO 161 (cell) are DIFFERENT tracks.
  // Taking one does NOT block the other — they satisfy different requirements.
  // However, for non-science majors, having BIO 115 is enough GE — don't pile on.
  {
    id: 'bio_ge',
    courses: ['BIO 115', 'BIO 161'],
    blocks: [], // Only block for non-science tracks (handled in track_excluded lists)
    tracks: ['BUSINESS', 'HUMANITIES', 'SOCIAL_SCI'],
  },
  // Psych: PSY 111 is intro-level; if completed, don't keep recommending it
  {
    id: 'intro_psych',
    courses: ['PSY 111'],
    blocks: [],
  },
  // Economics intro sequence: ECO 101 (micro) and ECO 102 (macro) are a sequence,
  // but taking 101 does NOT mean skip 102 for business/social-sci students.
  // For non-business students, having 101 is usually enough for GE.
  {
    id: 'econ_ge',
    courses: ['ECO 101'],
    blocks: ['ECO 102'],
    tracks: ['HUMANITIES', 'HEALTH', 'STEM_CS', 'STEM_ENG', 'STEM_SCI'],
  },
]

// ── Helper functions ──────────────────────────────────────────────────────────

/** Returns the track name for a given major string */
function getMajorTrack(major) {
  if (!major) return 'GENERAL'
  const direct = MAJOR_TO_TRACK[major]
  if (direct) return direct
  // Fuzzy match
  const ml = major.toLowerCase()
  for (const [key, track] of Object.entries(MAJOR_TO_TRACK)) {
    if (ml.includes(key.toLowerCase()) || key.toLowerCase().includes(ml)) return track
  }
  return 'GENERAL'
}

/** Returns all course codes that should be EXCLUDED for a given track */
function getTrackExclusions(track) {
  const rules = TRACK_RULES[track] || {}
  return new Set([
    ...(rules.math_excluded   || []),
    ...(rules.science_excluded || []),
    ...(rules.cs_excluded      || []),
  ])
}

/**
 * Returns course codes that should be blocked because the student has already
 * satisfied that requirement slot via an equivalent course.
 *
 * Example: business student has MTH 141 → block MTH 151, 251, 252, 125
 */
function getEquivalencyBlocks(completedCodes, track) {
  const completed = new Set(completedCodes.map(c => c.toUpperCase()))
  const blocked   = new Set()

  for (const group of EQUIVALENCY_GROUPS) {
    // Only apply to the relevant tracks (or all tracks if not specified)
    if (group.tracks && !group.tracks.includes(track)) continue

    const hasOne = group.courses.some(c => completed.has(c))
    if (hasOne) {
      for (const b of group.blocks) blocked.add(b)
    }
  }

  return blocked
}

/**
 * Returns a score adjustment (+positive / -negative) for a given course code
 * based on the student's track.
 *
 * Called during scoring to reward track-appropriate courses and penalize
 * wrong-track courses that slipped through the exclusion filter.
 */
function getTrackScoreAdjustment(courseCode, track) {
  const rules = TRACK_RULES[track]
  if (!rules) return 0

  // Priority bonus — courses that are especially well-suited for this track
  if (rules.priority?.includes(courseCode)) return 20

  // Math preferred for this track — mild positive signal
  if (rules.math_preferred?.includes(courseCode)) return 8

  // Science preferred
  if (rules.science_preferred?.includes(courseCode)) return 8

  // Wrong-track math or science (not yet caught by hard exclusion) — heavy penalty
  const allExcluded = [
    ...(rules.math_excluded    || []),
    ...(rules.science_excluded || []),
    ...(rules.cs_excluded      || []),
  ]
  if (allExcluded.includes(courseCode)) return -(rules.wrong_track_penalty || 30)

  return 0
}

/**
 * Returns human-readable reasoning about why a course was picked for this track.
 * Used to populate the "reasons" field in recommendation results.
 */
function getTrackReason(courseCode, track) {
  const rules = TRACK_RULES[track]
  if (!rules) return null

  if (rules.priority?.includes(courseCode)) {
    const trackLabels = {
      BUSINESS: 'business programs',
      STEM_CS:  'CS/Software Engineering',
      STEM_ENG: 'Engineering students',
      STEM_SCI: 'science/pre-health students',
      STEM_MATH:'Math/Statistics majors',
      SOCIAL_SCI:'social science majors',
      HUMANITIES:'humanities programs',
      HEALTH:   'health science programs',
    }
    return `Core course for ${trackLabels[track] || 'your major'}`
  }
  if (rules.math_preferred?.includes(courseCode)) return 'Right math track for your major'
  if (rules.science_preferred?.includes(courseCode)) return 'Appropriate lab science for your program'
  return null
}

module.exports = {
  MAJOR_TO_TRACK,
  TRACK_RULES,
  EQUIVALENCY_GROUPS,
  getMajorTrack,
  getTrackExclusions,
  getEquivalencyBlocks,
  getTrackScoreAdjustment,
  getTrackReason,
}
