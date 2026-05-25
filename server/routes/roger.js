/**
 * Roger AI advisor — chat backend with tool use
 *
 * POST /api/roger/chat
 * Body: {
 *   messages: [{ role: 'user'|'assistant', content: string }],
 *   profile:  { major, minor, year, completedCourses: [], plan: [], schedule: [] }
 * }
 * Returns: { content: string, scheduleProposal?: object }
 *
 * Tools Roger can call:
 *   search_sections       — queries SQLite for live course sections
 *   propose_schedule_change — structured proposal returned to the frontend
 */

const express  = require('express')
const router   = express.Router()
const { getDb } = require('../db/setup')

// ── Tool: search course sections from DB ──────────────────────────────────────

async function searchSections({ course_code, avoid_days = [], prefer_time = null }) {
  const code = course_code?.toUpperCase?.().trim()
  if (!code) return { found: false, message: 'No course code provided.' }

  try {
    const db = getDb()
    const rows = db.prepare(`
      SELECT
        c.code, c.name, c.credits,
        s.crn, s.section, s.instructor, s.rmp_score,
        s.days, s.start_time, s.end_time, s.schedule, s.room,
        s.seats_avail, s.seats_total, s.delivery, s.term_label
      FROM sections s
      JOIN courses c ON c.code = s.code
      WHERE s.campus = 'Oxford'
        AND s.term = (SELECT MAX(term) FROM sections)
        AND c.code = ?
      ORDER BY s.rmp_score DESC, s.seats_avail DESC
      LIMIT 15
    `).all(code)
    db.close()

    if (rows.length === 0) {
      return { found: false, message: `No sections found for ${code}. The course may not be offered this term.` }
    }

    // Filter by days to avoid
    let filtered = rows
    if (avoid_days.length > 0) {
      const avoidUpper = avoid_days.map(d => d.toUpperCase())
      filtered = rows.filter(s => s.days && !avoidUpper.some(d => s.days.includes(d)))
    }

    // Filter by time preference
    if (prefer_time && filtered.length > 0) {
      const checks = {
        morning:   s => s.start_time && s.start_time < '12:00',
        afternoon: s => s.start_time && s.start_time >= '12:00' && s.start_time < '17:00',
        evening:   s => s.start_time && s.start_time >= '17:00',
      }
      const check = checks[prefer_time]
      if (check) {
        const pref = filtered.filter(check)
        if (pref.length > 0) filtered = pref
      }
    }

    if (filtered.length === 0) {
      const avoidStr = avoid_days.length ? ` without ${avoid_days.join('/')} days` : ''
      return {
        found: false,
        allSections: rows.slice(0, 5).map(formatSection),
        message: `No open sections of ${code} found${avoidStr}. Here are all available sections if you can adjust your preference.`,
      }
    }

    return {
      found: true,
      count: filtered.length,
      sections: filtered.slice(0, 5).map(formatSection),
    }
  } catch (e) {
    return { found: false, message: `Database unavailable (${e.message}). The scraper may not have run yet.` }
  }
}

function formatSection(s) {
  return {
    crn:        s.crn,
    code:       s.code,
    name:       s.name,
    credits:    s.credits,
    section:    s.section,
    instructor: s.instructor || 'Staff',
    rmp_score:  s.rmp_score,
    days:       s.days,
    start_time: s.start_time,
    end_time:   s.end_time,
    schedule:   s.schedule || 'TBA',
    room:       s.room || 'TBA',
    seats_avail: s.seats_avail,
    seats_total: s.seats_total,
    delivery:   s.delivery,
    term_label: s.term_label,
  }
}

// ── Tool definitions sent to Claude ──────────────────────────────────────────

const TOOLS = [
  {
    name: 'search_sections',
    description: `Search the Miami University live course database for available sections of a specific course.
Use this whenever a student asks about:
- Available times/sections for a course
- Finding alternatives that avoid certain days
- Morning/afternoon/evening preferences
- Seat availability for a course
Always use this before proposing a schedule change.`,
    input_schema: {
      type: 'object',
      properties: {
        course_code: {
          type: 'string',
          description: 'The course code to search for, e.g. "CSE 174", "MTH 151", "ENG 111"',
        },
        avoid_days: {
          type: 'array',
          items: { type: 'string' },
          description: 'Day codes to exclude from results. M=Monday, T=Tuesday, W=Wednesday, R=Thursday, F=Friday',
        },
        prefer_time: {
          type: 'string',
          enum: ['morning', 'afternoon', 'evening'],
          description: 'Optional time-of-day preference to filter results',
        },
      },
      required: ['course_code'],
    },
  },
  {
    name: 'propose_schedule_change',
    description: `Propose a concrete change to the student's schedule. The student will see an Accept/Reject card.
Only call this AFTER you have found a specific section using search_sections.
Use action="add" to add a new course, "remove" to drop one, "swap" to replace one section with another.`,
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'remove', 'swap'],
          description: 'What kind of change to make',
        },
        section: {
          type: 'object',
          description: 'The section to add or swap in (full section object from search_sections)',
        },
        replace_crn: {
          type: 'string',
          description: 'For swap/remove: the CRN currently in the schedule to replace or remove',
        },
        replace_code: {
          type: 'string',
          description: 'For swap/remove: the course code being replaced (for display)',
        },
        reason: {
          type: 'string',
          description: 'One sentence explaining why this change is good for the student',
        },
      },
      required: ['action', 'reason'],
    },
  },
]

// ── System prompt builder ─────────────────────────────────────────────────────

/** Fuzzy-find a major or minor entry in a requirements JSON by name */
function findReqEntry(allReqs, name) {
  if (!name || !allReqs) return null
  const keys = Object.keys(allReqs).filter(k => !k.startsWith('_'))
  const nl   = name.toLowerCase()

  // 1. Exact match
  const exact = keys.find(k => k === name)
  if (exact) return exact

  // 2. Case-insensitive exact
  const ciExact = keys.find(k => k.toLowerCase() === nl)
  if (ciExact) return ciExact

  // 3. Keys that CONTAIN the query — pick the shortest (closest match)
  const containing = keys.filter(k => k.toLowerCase().includes(nl))
  if (containing.length > 0) return containing.sort((a, b) => a.length - b.length)[0]

  // 4. Query contains the key — pick the longest key (most specific)
  const contained = keys.filter(k => nl.includes(k.toLowerCase()) && k.length > 3)
  if (contained.length > 0) return contained.sort((a, b) => b.length - a.length)[0]

  return null
}

function buildSystemPrompt(profile = {}) {
  const { major, minor, year, completedCourses = [], plan = [], schedule = [] } = profile
  const completedSet = new Set(completedCourses.map(c => c.toUpperCase().trim()))

  const completedStr = completedCourses.length ? completedCourses.join(', ') : 'none listed yet'
  const planStr      = plan.length
    ? plan.map(c => `${c.code} (${c.name || ''}, ${c.credits || 3} cr)`).join(', ')
    : 'no courses added yet'
  const scheduleStr  = schedule.length
    ? schedule.map(c => `${c.code} — ${c.name || ''} (${c.schedule || 'TBA'}, CRN: ${c.crn})`).join('\n  ')
    : 'no schedule built yet'
  const scheduledCodes = new Set(schedule.map(c => c.code?.toUpperCase()))

  const { getMajorTrack, TRACK_RULES } = (() => {
    try { return require('../data/majorCurriculum') } catch { return {} }
  })()
  const track      = getMajorTrack ? getMajorTrack(major) : 'GENERAL'
  const trackRules = TRACK_RULES?.[track] || {}

  // ── Load major-specific course requirements ──────────────────────────────────
  const majorReqSection = (() => {
    try {
      const allReqs = require('../data/majorRequirements.json')
      const key     = findReqEntry(allReqs, major)
      if (!key) return `\n## Major Curriculum\nNo curriculum data found for "${major || 'unspecified major'}" in the MU bulletin database. Ask the student to share their degree audit or list the courses they need.\n`

      const reqs = allReqs[key]
      const remaining = (reqs.coreCourses || []).filter(c => !completedSet.has(c.code.toUpperCase()))
      const inSchedule = remaining.filter(c => scheduledCodes.has(c.code.toUpperCase()))
      const stillNeeded = remaining.filter(c => !scheduledCodes.has(c.code.toUpperCase()))

      // Determine which courses are unlocked (all prereqs satisfied or in schedule)
      const available = new Set([...completedCourses.map(c=>c.toUpperCase()), ...schedule.map(c=>c.code?.toUpperCase())])
      const unlocked  = stillNeeded.filter(c =>
        (c.prereqs || []).every(p => available.has(p.toUpperCase()))
      )
      const locked    = stillNeeded.filter(c =>
        !(c.prereqs || []).every(p => available.has(p.toUpperCase()))
      )

      const electiveInfo = (reqs.electiveGroups || [])
        .map(g => `**${g.name}** (need ${g.requiredCredits} cr): ${g.courses.join(', ')}`)
        .join('\n')

      const suggestedSeq = Object.entries(reqs.suggestedOrder || {})
        .map(([sem, courses]) => `  - ${sem}: ${courses.join(', ')}`)
        .join('\n')

      return `
## ${key} Curriculum (MU Bulletin)
You have the COMPLETE curriculum for this student. Use these EXACT course codes — no guessing.

**Currently in schedule (already added):** ${inSchedule.length ? inSchedule.map(c=>c.code).join(', ') : 'none'}

**Unlocked & still needed** (prereqs satisfied — recommend these first):
${unlocked.length ? unlocked.map(c => `- **${c.code}** — ${c.name} (${c.credits} cr)${c.prereqs?.length ? ` | prereqs: ✓ ${c.prereqs.join(', ')}` : ''}`).join('\n') : '- None — all unlocked courses are scheduled! ✅'}

**Locked — missing prereqs** (cannot take yet):
${locked.length ? locked.map(c => `- ${c.code} — ${c.name} | needs: ${c.prereqs.join(', ')}`).join('\n') : '- None'}

**All completed:** ${[...completedSet].join(', ') || 'none'}

**Electives needed:**
${electiveInfo || 'see advisor'}

**Suggested 4-year sequence:**
${suggestedSeq || '  see advisor'}

IMPORTANT: When the student asks to build a schedule or add requirements, use search_sections on the UNLOCKED courses above, then propose_schedule_change for each one found.`
    } catch (e) {
      return `\n## Major Curriculum\nCould not load requirements: ${e.message}\n`
    }
  })()

  // ── Load minor-specific requirements ─────────────────────────────────────────
  const minorReqSection = (() => {
    if (!minor) return ''
    try {
      const allMinors = require('../data/minorRequirements.json')
      const key       = findReqEntry(allMinors, minor)
      if (!key) return `\n## ${minor} Minor\nNo minor data found — advise student to check MU bulletin.\n`

      const m = allMinors[key]
      const remaining = (m.requiredCourses || []).filter(c => !completedSet.has(c.code.toUpperCase()))
      return `
## ${key} Minor Requirements
**Required courses still needed:**
${remaining.length ? remaining.map(c => `- **${c.code}** — ${c.name}${c.prereqs?.length ? ` (needs ${c.prereqs.join(', ')})` : ''}`).join('\n') : '- All required courses completed! ✅'}
${m.electiveCourses?.length ? `**Electives** (${m.electiveCreditsRequired} cr needed): ${m.electiveCourses.join(', ')}` : ''}`
    } catch {
      return ''
    }
  })()

  return `You are Roger 🎓, a friendly and knowledgeable academic advisor at Miami University (Ohio). Your job is to help students build the best possible semester schedule.

## Student's Profile
- **Major:** ${major || 'not specified'} (Academic track: ${track})
- **Minor:** ${minor || 'none'}
- **Year:** ${year || 'not specified'}
- **Completed courses:** ${completedStr}
- **Courses in plan:** ${planStr}
- **Current schedule:**
  ${scheduleStr}
${majorReqSection}
${minorReqSection}
## Track-Specific Guidance
${track === 'BUSINESS' ? `
- Math path: MTH 141 (Business Calculus) is correct — NOT MTH 151/251/252
- They do not need PHY 181, CHM 141/241, or engineering-level lab sciences` : ''}
${track === 'STEM_CS' ? `
- Math path: MTH 151 → MTH 251 → MTH 231/222; also STA 261
- MTH 141 does NOT satisfy CS prerequisites` : ''}
${track === 'STEM_SCI' ? `
- Math: MTH 151 is standard; science sequence: BIO 115 → 116; CHM 141 → 142 → 241 → 242` : ''}
${track === 'SOCIAL_SCI' ? `
- Math: STA 261 is correct — do NOT suggest MTH 151/251` : ''}
${track === 'HUMANITIES' ? `
- Math: STA 261 or MTH 141 — NOT MTH 151; no need for lab sciences beyond one GE` : ''}

## Your Tools
1. **search_sections** — searches the LIVE Miami course database. Use for EVERY course before proposing it. Never guess at times/seats.
2. **propose_schedule_change** — after finding a section, propose adding/swapping/removing it. The student sees an Accept button.

**When asked to build a schedule or fill requirements:**
1. Look at the "Unlocked & still needed" list above
2. Call search_sections for each course (respecting any day/time preferences)
3. Call propose_schedule_change for the best section of each course found
4. Aim for 15–17 credit hours unless the student asks for more/less

## Your Role
- You KNOW this student's complete major curriculum — reference it directly, don't say "I don't have that info"
- When a student wants schedule changes, search for real sections and propose concrete changes with Accept buttons
- Be encouraging, specific, and genuinely helpful

## Tone & Style
- Warm and conversational, like a real advisor who knows the student
- Concise: 2–4 sentences unless a complex question needs more
- Use emoji sparingly but naturally (🎓 📚 ✅)

## Miami University Context
- Located in Oxford, Ohio — Miami Plan required for all undergrads
- Registration priority based on credit hours earned

Never make up course data — always use search_sections to get real section info.`
}

// ── POST /api/roger/chat ──────────────────────────────────────────────────────

router.post('/chat', async (req, res) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      const fallbacks = [
        "I'm Roger, your schedule advisor! It looks like my AI connection isn't configured right now, but I can still help — check out the course recommendations on the Results page and use the AI Build button on the Schedule page to build a conflict-free plan.",
        "Hey! My AI brain is taking a quick nap (missing API key in server config), but don't worry — the AI Build feature on the Schedule page will build you a smart schedule automatically.",
        "Great question! My AI connection needs a quick setup (ANTHROPIC_API_KEY in server/.env), but in the meantime: use the Requirement Gaps sidebar to see what you still need, and hit AI Build to fill your schedule automatically.",
      ]
      const msg = req.body.messages?.at(-1)?.content || ''
      const i   = Math.abs(msg.length) % fallbacks.length
      return res.json({ content: fallbacks[i] })
    }

    const { messages = [], profile = {} } = req.body

    let Anthropic
    try {
      Anthropic = require('@anthropic-ai/sdk')
      if (Anthropic.default) Anthropic = Anthropic.default
    } catch (e) {
      throw new Error('Anthropic SDK not found — run npm install')
    }

    const client = new Anthropic({ apiKey })

    // Only keep clean text messages in history (no tool artifacts from prior turns)
    const history = messages.slice(-24).map(m => ({
      role:    m.role,
      content: typeof m.content === 'string' ? m.content : String(m.content),
    }))

    // ── Agentic tool-use loop (max 4 rounds) ────────────────────────────────
    let currentMessages = history
    let scheduleProposal = null
    let finalText = ''

    for (let round = 0; round < 8; round++) {
      const response = await client.messages.create({
        model:      'claude-haiku-4-5',
        max_tokens: 1500,
        system:     buildSystemPrompt(profile),
        tools:      TOOLS,
        messages:   currentMessages,
      })

      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use')
      const textBlocks    = response.content.filter(b => b.type === 'text')

      if (textBlocks.length > 0) {
        finalText = textBlocks.map(b => b.text).join('\n').trim()
      }

      // No tool calls — we're done
      if (response.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) break

      // Execute each tool call
      const toolResults = []
      for (const tu of toolUseBlocks) {
        let result

        if (tu.name === 'search_sections') {
          result = await searchSections(tu.input)

        } else if (tu.name === 'propose_schedule_change') {
          // Don't execute — just capture for the frontend
          scheduleProposal = tu.input
          result = { success: true, message: 'Proposal queued for student review.' }

        } else {
          result = { error: `Unknown tool: ${tu.name}` }
        }

        toolResults.push({
          type:        'tool_result',
          tool_use_id: tu.id,
          content:     JSON.stringify(result),
        })
      }

      // Append this round's assistant message + tool results for next round
      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: response.content },
        { role: 'user',      content: toolResults },
      ]
    }

    const content = finalText || "I couldn't process that — try rephrasing your question!"
    return res.json({ content, scheduleProposal })

  } catch (err) {
    console.error('[roger/chat]', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
