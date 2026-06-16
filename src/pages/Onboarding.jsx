import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import COURSES_DATA from '../data/courses.json'
import { searchCourses } from '../api'
import Tesseract from 'tesseract.js'
import { saveProfile, loadProfile } from '../lib/userProfile'

// ── Image → base64 helper ────────────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ── Preprocess image for better OCR (canvas upscale + contrast) ──────────────
async function preprocessImage(file) {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale  = Math.min(4, 2400 / Math.max(img.width, img.height, 1))
      const canvas = document.createElement('canvas')
      canvas.width  = img.width  * scale
      canvas.height = img.height * scale
      const ctx = canvas.getContext('2d')
      ctx.filter = 'grayscale(100%) contrast(160%) brightness(105%)'
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      canvas.toBlob(blob => resolve(blob || file), 'image/png', 0.95)
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}

// ── Fix common OCR character confusions in extracted text ────────────────────
function fixOcrArtifacts(text) {
  return text
    // Normalize line separators
    .replace(/\r\n?/g, '\n')
    // Fix I→J confusion at the start of department codes (e.g. IRN → JRN, IPN → JPN)
    .replace(/\bI(RN|PN)\b/g, 'J$1')
    // Fix digit/letter swaps inside course numbers: MTH I5I → MTH 151, CS0 → CSO handled below
    .replace(/\b([A-Z]{2,4})\s*([0-9OIlS]{3})\b/g, (_, dept, num) => {
      const fixed = num
        .replace(/O/g, '0')
        .replace(/I|l/g, '1')
        .replace(/S/g, '5')
      return `${dept} ${fixed}`
    })
}

// ── Claude Vision transcript scanner ────────────────────────────────────────
async function scanWithClaude(file, onProgress) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey || apiKey === 'your-api-key-here') return null

  onProgress('Sending to AI scanner…')
  const mediaType = file.type.startsWith('image/') ? file.type : 'image/jpeg'
  const b64 = await fileToBase64(file)

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: b64 },
          },
          {
            type: 'text',
            text: `This is a Miami University (Oxford, OH) academic document — a transcript, degree audit, BannerWeb schedule, or similar.

Find every COMPLETED course code visible. Miami course codes look like: CSE 174, MTH 151, PSY 111, ACC 221 (2–4 uppercase letters, space, 3 digits).

Rules:
- Include grades A/A-/B+/B/B-/C+/C/C-/D/CR — those are completed
- Exclude: W (withdrawn), IP / In Progress, courses with no grade, future semesters
- If you see partial codes like "MTH\\n151" on separate lines, join them
- Watch for OCR lookalike errors: the letter I can be misread as J — if you see IRN or IPN, correct to JRN or JPN

Reply with ONLY a JSON array of strings, nothing else.
Example: ["CSE 174","MTH 151","ENG 111","PSY 111"]
If nothing found: []`,
          },
        ],
      }],
    }),
  })

  if (!res.ok) return null
  const json = await res.json()
  const raw  = json.content?.[0]?.text?.trim() ?? '[]'
  // Extract the JSON array even if Claude adds a tiny preamble
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) return []
  return JSON.parse(match[0])
}

// ── Rich natural-language aliases for common courses ─────────────────────────
// These supplement the auto-generated aliases in courses.json with the
// informal names students actually use ("calc 1", "orgo", "psych", etc.)
const RICH_ALIASES = {
  'MTH 125': ['precalc', 'pre-calc', 'precalculus', 'pre calculus', 'pre calc'],
  'MTH 141': ['business calculus', 'calc for business', 'calculus for business', 'business calc'],
  'MTH 151': ['calc 1', 'calculus 1', 'calc i', 'calc one', 'calculus one', 'first semester calculus'],
  'MTH 251': ['calc 2', 'calculus 2', 'calc ii', 'calc two', 'calculus two', 'second semester calculus'],
  'MTH 252': ['calc 3', 'calculus 3', 'calc iii', 'multivariable calculus', 'multivariable calc', 'multi calc'],
  'MTH 222': ['linear algebra', 'linalg', 'lin alg', 'linear alg'],
  'MTH 231': ['discrete math', 'discrete mathematics', 'discrete'],
  'MTH 245': ['diff eq', 'differential equations', 'diffeq', 'odes'],
  'STA 261': ['stats', 'statistics', 'intro stats', 'intro to statistics'],
  'STA 301': ['applied stats', 'applied statistics'],
  'ENG 111': ['english comp', 'english composition', 'composition', 'english 1', 'comp 1', 'writing 1', 'freshman english'],
  'ENG 112': ['advanced composition', 'advanced writing', 'english 2', 'comp 2', 'writing 2'],
  'CSE 174': ['intro to programming', 'intro programming', 'programming fundamentals', 'cs 1', 'cs1', 'intro cs', 'programming 1', 'foundations of programming'],
  'CSE 271': ['object oriented programming', 'oop', 'java', 'cs 2', 'cs2', 'programming 2', 'object-oriented programming'],
  'CSE 274': ['data structures', 'dsa', 'data abstraction'],
  'CSE 374': ['algorithms', 'algo', 'advanced algorithms'],
  'CSE 383': ['web development', 'web dev', 'web programming', 'web apps'],
  'CSE 385': ['databases', 'sql', 'db'],
  'CSE 432': ['machine learning', 'ml'],
  'CSE 486': ['artificial intelligence', 'ai intro'],
  'BIO 115': ['bio 1', 'biology 1', 'intro bio', 'intro to biology', 'general biology', 'gen bio'],
  'BIO 116': ['bio 2', 'biology 2', 'organismal biology'],
  'BIO 161': ['cell bio', 'cell biology', 'cellular biology'],
  'CHM 141': ['chem 1', 'chemistry 1', 'gen chem 1', 'general chemistry 1', 'general chemistry', 'intro chemistry'],
  'CHM 142': ['chem 2', 'chemistry 2', 'gen chem 2', 'general chemistry 2'],
  'CHM 241': ['organic chemistry', 'orgo', 'ochem', 'organic chem', 'orgo 1'],
  'CHM 242': ['orgo 2', 'organic 2', 'organic chemistry 2'],
  'PHY 181': ['physics 1', 'physics i', 'gen physics', 'general physics'],
  'PHY 182': ['physics 2', 'physics ii', 'gen physics 2'],
  'PSY 111': ['intro to psychology', 'intro psychology', 'intro psych', 'psych', 'psychology'],
  'SOC 153': ['sociology', 'intro sociology', 'intro soc', 'intro to sociology'],
  'POL 141': ['american government', 'political science', 'poli sci', 'pol sci', 'government', 'american politics'],
  'ECO 101': ['microeconomics', 'micro econ', 'micro economics', 'intro micro', 'econ 1', 'intro to econ', 'intro econ', 'economics'],
  'ECO 102': ['macroeconomics', 'macro econ', 'macro economics', 'intro macro', 'econ 2', 'macro'],
  'ACC 221': ['financial accounting', 'accounting 1', 'intro accounting', 'intro to accounting', 'acct 1'],
  'ACC 222': ['managerial accounting', 'accounting 2', 'cost accounting'],
  'MGT 291': ['management', 'intro management', 'organizational behavior', 'org behavior'],
  'MKT 291': ['marketing', 'intro marketing', 'principles of marketing'],
  'FIN 301': ['finance', 'corporate finance', 'business finance', 'intro finance', 'financial management'],
  'HST 111': ['world history 1', 'world history i', 'western civ 1', 'history 1', 'world history'],
  'HST 112': ['world history 2', 'world history ii', 'western civ 2', 'history 2', 'modern history'],
  'PHL 131': ['ethics', 'intro philosophy', 'intro to philosophy', 'practical ethics', 'philosophy'],
  'GEO 121': ['geography', 'physical geography', 'intro geography'],
  'REL 101': ['religion', 'intro to religion', 'intro religion', 'religious studies'],
  'MUS 109': ['music appreciation', 'intro to music', 'music'],
  'THE 101': ['theatre', 'theater', 'intro theatre', 'intro to theatre', 'intro theater', 'drama'],
  'KNH 251': ['anatomy', 'anatomy and physiology', 'a&p'],
  'NSG 201': ['nursing fundamentals', 'fundamentals of nursing', 'intro nursing'],
  'JRN 101': ['journalism', 'intro journalism', 'intro to journalism'],
  'SPN 101': ['spanish 1', 'spanish i', 'beginning spanish', 'intro spanish'],
  'FRE 101': ['french 1', 'french i', 'beginning french', 'intro french'],
  'GER 101': ['german 1', 'german i', 'beginning german', 'intro german'],
}

// Merge scraped data with rich aliases; sort aliases longest-first for greedy matching
const SORTED_DB = COURSES_DATA.map(course => {
  const extra = RICH_ALIASES[course.code] || []
  const combined = [...new Set([...extra, ...course.aliases])]
  return { ...course, aliases: combined.sort((a, b) => b.length - a.length) }
})

// ── Major → suggested starter courses ────────────────────────────────────────
const MAJOR_STARTERS = {
  // Engineering & Computing
  'Computer Science':              ['CSE 174', 'CSE 271', 'MTH 151', 'MTH 231', 'STA 261'],
  'Software Engineering':          ['CSE 174', 'CSE 271', 'MTH 151', 'MTH 231', 'CEC 111'],
  'Mechanical Engineering':        ['MTH 151', 'PHY 181', 'CEC 111', 'MME 211', 'MTH 251'],
  'Electrical Engineering':        ['MTH 151', 'PHY 181', 'CEC 111', 'ECE 205', 'MTH 251'],
  // Business
  'Accounting':                    ['ACC 221', 'ACC 222', 'ECO 101', 'MGT 291', 'STA 261'],
  'Finance':                       ['ACC 221', 'ECO 101', 'FIN 301', 'MTH 141', 'STA 261'],
  'Marketing':                     ['MKT 291', 'ACC 221', 'ECO 101', 'MGT 291', 'STA 261'],
  'Management':                    ['MGT 291', 'ACC 221', 'ECO 101', 'MKT 291'],
  'Information Systems & Analytics':['ACC 221', 'CSE 174', 'MGT 291', 'STA 261', 'ECO 101'],
  'Information Systems':           ['ACC 221', 'CSE 174', 'MGT 291', 'STA 261', 'ECO 101'],
  // Arts & Sciences — STEM
  'Biology':                       ['BIO 115', 'BIO 116', 'CHM 141', 'CHM 142', 'MTH 151'],
  'Chemistry':                     ['CHM 141', 'CHM 142', 'CHM 241', 'MTH 151', 'PHY 181'],
  'Physics':                       ['PHY 181', 'PHY 182', 'MTH 151', 'MTH 251', 'MTH 252'],
  'Mathematics':                   ['MTH 151', 'MTH 251', 'MTH 252', 'MTH 222', 'MTH 231'],
  'Statistics':                    ['STA 261', 'STA 301', 'MTH 151', 'MTH 251'],
  'Environmental Studies':         ['GEO 121', 'BIO 115', 'CHM 141', 'STA 261'],
  'Geology':                       ['GEO 121', 'CHM 141', 'PHY 181', 'MTH 151'],
  // Arts & Sciences — Social Sciences
  'Economics':                     ['ECO 101', 'ECO 102', 'MTH 151', 'STA 261', 'POL 141'],
  'Psychology':                    ['PSY 111', 'PSY 241', 'STA 261', 'BIO 115', 'SOC 153'],
  'Sociology':                     ['SOC 153', 'SOC 251', 'PSY 111', 'POL 141', 'ENG 111'],
  'Political Science':             ['POL 141', 'POL 281', 'ECO 101', 'HST 112', 'SOC 153'],
  'History':                       ['HST 111', 'HST 112', 'ENG 111', 'ENG 112', 'POL 141'],
  'Philosophy':                    ['PHL 131', 'PHL 141', 'ENG 111', 'ENG 112'],
  'Geography':                     ['GEO 121', 'GEO 131', 'STA 261'],
  'Public Administration':         ['POL 141', 'SOC 153', 'ECO 101', 'ENG 111'],
  'Criminal Justice':              ['SOC 153', 'PSY 111', 'POL 141', 'ENG 111'],
  'Social Work':                   ['SOC 153', 'PSY 111', 'SWK 201', 'ENG 111'],
  // Arts & Sciences — Humanities
  'English':                       ['ENG 111', 'ENG 112', 'ENG 201', 'HST 111'],
  'Journalism':                    ['JRN 101', 'ENG 111', 'ENG 112', 'POL 141'],
  'Strategic Communication':       ['COM 101', 'ENG 111', 'MKT 291', 'SOC 153'],
  'Art History':                   ['ART 101', 'ART 102', 'HST 111', 'ENG 111'],
  'Architecture':                  ['ART 101', 'MTH 151', 'PHY 181', 'ENG 111'],
  'Creative Writing':              ['ENG 111', 'ENG 112', 'ENG 201', 'ENG 231'],
  'Spanish':                       ['SPN 101', 'SPN 102', 'SPN 201', 'ENG 111'],
  'Music':                         ['MUS 109', 'MUS 121', 'MUS 123', 'MUS 201'],
  'Theatre':                       ['THE 101', 'THE 201', 'ENG 111'],
  // Health
  'Kinesiology':                   ['KNH 251', 'BIO 115', 'CHM 141', 'STA 261'],
  'Exercise Science':              ['BIO 115', 'KNH 251', 'CHM 141', 'STA 261'],
  'Nursing':                       ['BIO 115', 'CHM 141', 'PSY 111', 'STA 261', 'NSG 201'],
  'Dietetics':                     ['BIO 115', 'CHM 141', 'PSY 111', 'STA 261'],
  // Pre-professional
  'Pre-Medicine':                  ['BIO 115', 'BIO 116', 'CHM 141', 'CHM 142', 'CHM 241', 'PHY 181', 'PSY 111'],
  'Pre-Law':                       ['POL 141', 'ENG 111', 'ENG 112', 'PHL 131', 'HST 112'],
  // Education
  'Early Childhood Education':     ['PSY 111', 'ENG 111', 'SOC 153', 'MTH 141'],
  'Integrated Mathematics Education':['MTH 151', 'MTH 231', 'STA 261', 'ENG 111'],
  // Other
  'Liberal Studies':               ['ENG 111', 'PSY 111', 'SOC 153', 'POL 141'],
  'Business Analytics':            ['STA 261', 'ACC 221', 'CSE 174', 'MGT 291'],
  'Communication Design':          ['ART 101', 'ENG 111', 'COM 101'],
  'Media & Culture':               ['COM 101', 'JRN 101', 'SOC 153', 'ENG 111'],
}

// ── NLP parser ────────────────────────────────────────────────────────────────

function normalizeCourseText(text) {
  return text
    .toLowerCase()
    // strip filler words
    .replace(/\b(i|i've|i have|i had|i took|took|take|taking|completed|finished|did|have|had|already|last|this|past|freshman|sophomore|junior|senior)\b/g, ' ')
    .replace(/\b(semester|year|fall|spring|summer|quarter)\b/g, ' ')
    // normalize numbers
    .replace(/\bone\b/g, '1').replace(/\btwo\b/g, '2').replace(/\bthree\b/g, '3')
    .replace(/\bfirst\b/g, '1').replace(/\bsecond\b/g, '2').replace(/\bthird\b/g, '3')
    // unify separators
    .replace(/\band\b|\balso\b|\bplus\b|\bwith\b/g, ',')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseCourses(rawText) {
  if (!rawText.trim()) return []
  const found = []

  // 1. Extract course codes — handles "CSE 271", "cse271", "mth-141", "MTH141"
  // Runs on the raw text to catch codes before normalization strips anything
  const codeRe = /\b([A-Za-z]{2,4})[\s\-]?(\d{3})\b/g
  for (const m of rawText.matchAll(codeRe)) {
    const code = `${m[1].toUpperCase()} ${m[2]}`
    if (found.find(f => f.code === code)) continue
    const entry = SORTED_DB.find(c => c.code === code)
    if (entry) {
      found.push({ code: entry.code, name: entry.name, credits: entry.credits, confidence: 'high' })
    } else {
      // Unknown code typed by user — add as-is so it isn't silently dropped
      found.push({ code, name: code, confidence: 'high' })
    }
  }

  // 2. Alias matching on normalized text (natural language descriptions)
  const normalized = normalizeCourseText(rawText)
  for (const entry of SORTED_DB) {
    if (found.find(f => f.code === entry.code)) continue
    for (const alias of entry.aliases) {
      // Word-boundary aware; allow flexible whitespace between words
      const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s,]+')
      const pattern = new RegExp(`(?<![a-z])${escapedAlias}(?![a-z])`)
      if (pattern.test(normalized)) {
        found.push({ code: entry.code, name: entry.name, credits: entry.credits, confidence: 'medium', matchedAs: alias })
        break
      }
    }
  }

  return found
}

// ── Data ─────────────────────────────────────────────────────────────────────

const MAJORS = [
  // A
  'Accounting', 'Architecture', 'Art Education', 'Art History',
  // B
  'Biochemistry', 'Biology', 'Biomedical Engineering', 'Business Analytics',
  // C
  'Chemical Engineering', 'Chemistry', 'Civil Engineering',
  'Classical Humanities', 'Communication Design', 'Communication Sciences & Disorders',
  'Computer Engineering', 'Computer Science', 'Creative Writing', 'Criminal Justice',
  // D
  'Data Analytics', 'Dietetics',
  // E
  'Early Childhood Education', 'Economics', 'Electrical & Computer Engineering',
  'English', 'Entrepreneurship', 'Environmental Studies', 'Exercise Science',
  // F
  'Finance', 'French',
  // G
  'Geography', 'Geology', 'German', 'Global & Intercultural Studies',
  // H
  'History',
  // I
  'Information Systems & Analytics', 'Information Systems and Cybersecurity Management',
  'Integrated Mathematics Education', 'Interactive Media Studies', 'International Business',
  'International Studies',
  // J–K
  'Journalism', 'Kinesiology',
  // L
  'Liberal Studies', 'Linguistics',
  // M
  'Management', 'Marketing', 'Mathematics', 'Mechanical Engineering',
  'Media & Culture', 'Microbiology', 'Middle Childhood Education', 'Music', 'Music Education',
  // N
  'Neuroscience', 'Nursing',
  // P
  'Philosophy', 'Physical Education', 'Physics', 'Political Science',
  'Pre-Law', 'Pre-Medicine', 'Psychology', 'Public Administration',
  // R
  'Real Estate',
  // S
  'Social Studies Education', 'Social Work', 'Sociology', 'Software Engineering',
  'Spanish', 'Special Education', 'Speech Pathology & Audiology', 'Statistics',
  'Strategic Communication',
  // T
  'Theatre',
  // U
  'Undecided / Exploring',
  // W–Z
  "Women's, Gender & Sexuality Studies", 'Zoology',
]

const MINORS = [
  'Accounting', 'Art History', 'Biochemistry', 'Biology', 'Chemistry',
  'Classical Humanities', 'Communication', 'Computer Science', 'Cybersecurity',
  'Data Analytics', 'Economics', 'English', 'Entrepreneurship',
  'Environmental Studies', 'Finance', 'French', 'Geography', 'German',
  'Global & Intercultural Studies', 'History', 'Information Security',
  'Interactive Media Studies', 'International Business', 'Journalism',
  'Kinesiology', 'Leadership Studies', 'Linguistics', 'Management',
  'Marketing', 'Mathematics', 'Microbiology', 'Music', 'Neuroscience',
  'Philosophy', 'Political Science', 'Psychology', 'Public Administration',
  'Real Estate', 'Social Work', 'Sociology', 'Spanish', 'Statistics',
  'Strategic Communication', 'Theatre',
  "Women's Gender and Sexuality Studies",
]

const INTERESTS = [
  { id: 'ai_ml', label: 'AI & Machine Learning', icon: '🤖' },
  { id: 'entrepreneurship', label: 'Entrepreneurship', icon: '🚀' },
  { id: 'data_science', label: 'Data Science', icon: '📊' },
  { id: 'sustainability', label: 'Sustainability', icon: '🌿' },
  { id: 'creative_arts', label: 'Creative Arts', icon: '🎨' },
  { id: 'health_wellness', label: 'Health & Wellness', icon: '💪' },
  { id: 'social_justice', label: 'Social Justice', icon: '⚖️' },
  { id: 'global_cultures', label: 'Global Cultures', icon: '🌍' },
  { id: 'finance_investing', label: 'Finance & Investing', icon: '💰' },
  { id: 'film_media', label: 'Film & Media', icon: '🎬' },
  { id: 'public_policy', label: 'Public Policy', icon: '🏛️' },
  { id: 'research_writing', label: 'Research & Writing', icon: '✍️' },
]

const STEPS = [
  { id: 1, label: 'Major', icon: '🎓' },
  { id: 2, label: 'Courses', icon: '📚' },
  { id: 3, label: 'Preferences', icon: '⚙️' },
]

// ── Shared helpers ────────────────────────────────────────────────────────────

function getCourseByCode(code) {
  return SORTED_DB.find(c => c.code === code)
}

// ── Step indicator (dots on mobile, pills on desktop) ────────────────────────

function StepDots({ current }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2">
          <div className={`transition-all duration-300 ${
            s.id === current
              ? 'w-8 h-2.5 rounded-full bg-miami-red'
              : s.id < current
              ? 'w-2.5 h-2.5 rounded-full bg-red-300'
              : 'w-2.5 h-2.5 rounded-full bg-gray-200'
          }`} />
        </div>
      ))}
      <span className="text-xs text-gray-400 ml-1">Step {current} of {STEPS.length}</span>
    </div>
  )
}

// ── Step 1: Major ────────────────────────────────────────────────────────────

function Step1({ data, setData }) {
  const [query,       setQuery]       = useState('')
  const [minorQuery,  setMinorQuery]  = useState('')
  const [showMinor,   setShowMinor]   = useState(!!data.minor)

  const filtered      = MAJORS.filter(m => m.toLowerCase().includes(query.toLowerCase()))
  const filteredMinors = MINORS.filter(m => m.toLowerCase().includes(minorQuery.toLowerCase()))

  return (
    <div>
      <div className="text-center mb-7">
        <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-3">🎓</div>
        <h2 className="text-2xl font-extrabold text-gray-900 dark:text-gray-50 mb-1.5">What's your major?</h2>
        <p className="text-gray-400 dark:text-gray-500 text-sm">We'll match courses to your exact degree requirements.</p>
      </div>

      <div className="space-y-3">
        {/* ── Major selector ── */}
        {data.major ? (
          <div className="flex items-center gap-3 p-3.5 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 rounded-xl">
            <span className="text-miami-red font-bold text-lg">✓</span>
            <div>
              <p className="text-miami-red font-bold text-sm">{data.major}</p>
              {data.concentration && <p className="text-red-400 text-xs">{data.concentration}</p>}
            </div>
            <button
              className="ml-auto text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-medium px-2 py-1 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
              onClick={() => setData(d => ({ ...d, major: '', concentration: '' }))}
            >
              Change
            </button>
          </div>
        ) : (
          <>
            <div className="relative">
              <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                className="input-field pl-10"
                placeholder="Search majors..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoFocus
              />
            </div>
            <div className="max-h-52 overflow-y-auto rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-800">
              {filtered.map(m => (
                <button
                  key={m}
                  className="w-full text-left px-4 py-3 text-sm hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-miami-red transition-colors font-medium text-gray-700 dark:text-gray-300 border-b border-gray-50 dark:border-gray-700 last:border-0"
                  onClick={() => setData(d => ({ ...d, major: m }))}
                >
                  {m}
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Concentration ── */}
        {data.major && data.major !== 'Undecided / Exploring' && (
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
              Concentration / track <span className="text-gray-300 dark:text-gray-600 font-normal normal-case">(optional)</span>
            </label>
            <input
              className="input-field"
              placeholder="e.g. Software Engineering track, Data Analytics..."
              value={data.concentration || ''}
              onChange={e => setData(d => ({ ...d, concentration: e.target.value }))}
            />
          </div>
        )}

        {/* ── Minor selector ── */}
        {data.major && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Minor <span className="text-gray-300 dark:text-gray-600 font-normal normal-case">(optional)</span>
              </label>
              {!showMinor && !data.minor && (
                <button
                  onClick={() => setShowMinor(true)}
                  className="text-xs text-miami-red font-semibold hover:underline"
                >
                  + Add a minor
                </button>
              )}
            </div>

            {/* Selected minor pill */}
            {data.minor && (
              <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 rounded-xl">
                <span className="text-blue-600 font-bold text-sm">📚</span>
                <p className="text-blue-700 dark:text-blue-300 font-bold text-sm flex-1">{data.minor}</p>
                <button
                  className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-medium px-2 py-1 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                  onClick={() => { setData(d => ({ ...d, minor: '' })); setShowMinor(false) }}
                >
                  Remove
                </button>
              </div>
            )}

            {/* Minor dropdown */}
            {showMinor && !data.minor && (
              <>
                <div className="relative">
                  <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    className="input-field pl-10"
                    placeholder="Search minors..."
                    value={minorQuery}
                    onChange={e => setMinorQuery(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-800 mt-1.5">
                  <button
                    className="w-full text-left px-4 py-2.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium text-gray-400 border-b border-gray-50 dark:border-gray-700 italic"
                    onClick={() => { setShowMinor(false); setMinorQuery('') }}
                  >
                    No minor
                  </button>
                  {filteredMinors.map(m => (
                    <button
                      key={m}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:text-blue-700 transition-colors font-medium text-gray-700 dark:text-gray-300 border-b border-gray-50 dark:border-gray-700 last:border-0"
                      onClick={() => { setData(d => ({ ...d, minor: m })); setShowMinor(false); setMinorQuery('') }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Year ── */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Year at Miami</label>
          <div className="grid grid-cols-4 gap-2">
            {['Freshman', 'Sophomore', 'Junior', 'Senior'].map(y => (
              <button
                key={y}
                className={`py-2.5 rounded-xl text-xs font-bold border-2 transition-all ${
                  data.year === y
                    ? 'border-miami-red bg-miami-red text-white shadow-sm'
                    : 'border-gray-100 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-miami-red/30 hover:text-miami-red bg-gray-50 dark:bg-gray-800'
                }`}
                onClick={() => setData(d => ({ ...d, year: y }))}
              >
                {y}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Step 2: Courses (conversational NLP) ─────────────────────────────────────

function CourseChip({ code, name, onRemove, variant = 'confirmed' }) {
  const styles = {
    confirmed: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    pending:   'bg-blue-50 border-blue-200 text-blue-800',
    manual:    'bg-gray-100 border-gray-200 text-gray-700',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${styles[variant]}`}>
      {variant === 'confirmed' && <span className="text-emerald-500">✓</span>}
      <span>{code}</span>
      <span className="opacity-60 font-normal">· {name}</span>
      <button
        onClick={onRemove}
        className="ml-0.5 opacity-40 hover:opacity-100 transition-opacity text-sm leading-none"
        aria-label="Remove course"
      >
        ×
      </button>
    </span>
  )
}

function SuggestionChip({ code, name, onAdd }) {
  return (
    <button
      onClick={onAdd}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-dashed border-gray-300 text-gray-500 hover:border-miami-red hover:text-miami-red hover:bg-red-50 transition-all"
    >
      <span className="text-base leading-none">+</span>
      <span>{code}</span>
    </button>
  )
}

// ── Mock OCR: returns realistic courses by major for the photo-upload demo ────
function getMockTranscriptCourses(major) {
  const byMajor = {
    'Computer Science':     ['CSE 174', 'CSE 271', 'MTH 151', 'ENG 111', 'MTH 231'],
    'Software Engineering': ['CSE 174', 'CSE 271', 'MTH 151', 'ENG 111', 'MTH 231'],
    'Information Systems':  ['CSE 174', 'ACC 221', 'MGT 291', 'ENG 111', 'STA 261'],
    'Finance':              ['ACC 221', 'ECO 101', 'MTH 141', 'ENG 111', 'MGT 291'],
    'Accounting':           ['ACC 221', 'ACC 222', 'ECO 101', 'ENG 111', 'MGT 291'],
    'Marketing':            ['MKT 291', 'ACC 221', 'ECO 101', 'ENG 111', 'MGT 291'],
    'Management':           ['MGT 291', 'ACC 221', 'ECO 101', 'ENG 111', 'MKT 291'],
    'Economics':            ['ECO 101', 'ECO 102', 'MTH 151', 'ENG 111', 'STA 261'],
    'Biology':              ['BIO 115', 'BIO 116', 'CHM 141', 'ENG 111', 'MTH 151'],
    'Chemistry':            ['CHM 141', 'CHM 142', 'MTH 151', 'ENG 111', 'PHY 181'],
    'Pre-Medicine':         ['BIO 115', 'CHM 141', 'CHM 142', 'ENG 111', 'PSY 111'],
    'Psychology':           ['PSY 111', 'ENG 111', 'STA 261', 'BIO 115', 'SOC 153'],
    'Nursing':              ['BIO 115', 'CHM 141', 'PSY 111', 'ENG 111', 'STA 261'],
    'Political Science':    ['POL 141', 'ECO 101', 'HST 111', 'ENG 111', 'SOC 153'],
    'History':              ['HST 111', 'HST 112', 'POL 141', 'ENG 111', 'ENG 112'],
    'English':              ['ENG 111', 'ENG 112', 'HST 111', 'PHL 131'],
    'Journalism':           ['ENG 111', 'ENG 112', 'JRN 101', 'POL 141'],
  }
  return byMajor[major] || ['ENG 111', 'MTH 122', 'PSY 111', 'STA 261']
}

function Step2({ data, setData }) {
  const [inputText, setInputText] = useState('')
  const [parsed, setParsed] = useState([]) // courses detected from current text
  const [uploadState, setUploadState] = useState('idle') // 'idle' | 'scanning' | 'done' | 'error'
  const [photoFound, setPhotoFound] = useState([])
  const [scanProgress, setScanProgress] = useState(0)
  const [ocrRawText, setOcrRawText] = useState('')
  const debounceRef = useRef(null)
  const fileInputRef = useRef(null)
  const confirmedCodes = data.completedCourses || []

  // Suggestions: major-specific starters not yet added
  const majorSuggestions = (MAJOR_STARTERS[data.major] || [])
    .filter(code => !confirmedCodes.includes(code))
    .slice(0, 6)

  const confirm = useCallback((course) => {
    if (confirmedCodes.includes(course.code)) return
    setData(d => ({ ...d, completedCourses: [...(d.completedCourses || []), course.code] }))
    // Remove from parsed
    setParsed(prev => prev.filter(p => p.code !== course.code))
  }, [confirmedCodes, setData])

  const addByCode = useCallback((code) => {
    if (confirmedCodes.includes(code)) return
    const entry = getCourseByCode(code)
    if (entry) confirm({ code: entry.code, name: entry.name })
    else setData(d => ({ ...d, completedCourses: [...(d.completedCourses || []), code] }))
  }, [confirm, confirmedCodes, setData])

  const remove = useCallback((code) => {
    setData(d => ({ ...d, completedCourses: d.completedCourses.filter(c => c !== code) }))
  }, [setData])

  const rejectParsed = useCallback((code) => {
    setParsed(prev => prev.filter(p => p.code !== code))
  }, [])

  // Photo upload — Claude Vision (primary) → Tesseract fallback
  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploadState('scanning')
    setPhotoFound([])
    setScanProgress(0)
    setOcrRawText('')

    try {
      let rawCodes = null

      // ── Path A: Claude Vision ────────────────────────────────────────────
      const hasKey = import.meta.env.VITE_ANTHROPIC_API_KEY &&
                     import.meta.env.VITE_ANTHROPIC_API_KEY !== 'your-api-key-here'
      if (hasKey) {
        setScanProgress(30)
        rawCodes = await scanWithClaude(file, () => setScanProgress(70))
        setScanProgress(100)
      }

      // ── Path B: Tesseract fallback ───────────────────────────────────────
      if (rawCodes === null) {
        const processed = await preprocessImage(file)
        setScanProgress(10)
        const { data: { text } } = await Tesseract.recognize(processed, 'eng', {
          logger: m => {
            if (m.status === 'recognizing text') setScanProgress(10 + Math.round(m.progress * 85))
          },
          tessedit_pageseg_mode: '11', // sparse text — best for transcripts
        })
        setScanProgress(100)
        const fixed = fixOcrArtifacts(text)
        setOcrRawText(fixed)
        // parseCourses already handles direct code matching
        rawCodes = parseCourses(fixed).map(r => r.code)
      }

      // ── Resolve codes → full course objects ─────────────────────────────
      const seen = new Set()
      const found = (rawCodes || [])
        .map(code => {
          const normalized = code.trim().toUpperCase().replace(/[\s\-]+/, ' ')
          if (seen.has(normalized) || confirmedCodes.includes(normalized)) return null
          seen.add(normalized)
          const entry = SORTED_DB.find(c => c.code === normalized)
          return entry
            ? { code: entry.code, name: entry.name, credits: entry.credits, confidence: 'high' }
            : { code: normalized, name: normalized, confidence: 'high' }
        })
        .filter(Boolean)

      setPhotoFound(found)
      setUploadState(found.length > 0 ? 'done' : 'notfound')
    } catch (err) {
      console.error('Scan error:', err)
      setUploadState('error')
    }
  }

  const confirmAllPhoto = () => {
    photoFound.forEach(p => confirm(p))
    setPhotoFound([])
    setUploadState('idle')
  }

  const dismissPhoto = (code) => setPhotoFound(prev => prev.filter(p => p.code !== code))

  // Debounced parse — tries API first, falls back to local NLP
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (!inputText.trim()) { setParsed([]); return }

      // First run local parser (instant feedback)
      const local = parseCourses(inputText).filter(r => !confirmedCodes.includes(r.code))
      setParsed(local)

      // Then enrich with live DB data if backend is up
      try {
        const { courses } = await searchCourses(inputText, { limit: 10 })
        if (courses?.length) {
          const apiMapped = courses
            .filter(c => !confirmedCodes.includes(c.code))
            .map(c => ({ code: c.code, name: c.name, credits: c.credits, confidence: 'high' }))
          // Merge: API results override local, preserve local-only finds
          const merged = [...apiMapped]
          for (const l of local) {
            if (!merged.find(m => m.code === l.code)) merged.push(l)
          }
          setParsed(merged)
        }
      } catch {
        // Backend offline — local parse is already shown
      }
    }, 450)
    return () => clearTimeout(debounceRef.current)
  }, [inputText]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-confirm all parsed when user clears the input
  const handleBlur = () => {
    if (!inputText.trim() && parsed.length === 0) return
    parsed.forEach(p => confirm(p))
    setInputText('')
    setParsed([])
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      parsed.forEach(p => confirm(p))
      setInputText('')
      setParsed([])
    }
  }

  const hasAnything = confirmedCodes.length > 0

  return (
    <div>
      <div className="text-center mb-7">
        <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-3">📚</div>
        <h2 className="text-2xl font-extrabold text-gray-900 dark:text-gray-50 mb-1.5">What have you knocked out so far?</h2>
        <p className="text-gray-400 text-sm">Describe it however feels natural — we'll figure out the rest.</p>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf"
        capture="environment"
        className="hidden"
        onChange={handlePhotoUpload}
      />

      {/* Upload button */}
      <button
        type="button"
        onClick={() => { setUploadState('idle'); setPhotoFound([]); fileInputRef.current?.click() }}
        disabled={uploadState === 'scanning'}
        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-dashed transition-all mb-4 group
          ${uploadState === 'scanning'
            ? 'border-miami-red/40 bg-red-50 cursor-wait'
            : 'border-gray-200 hover:border-miami-red hover:bg-red-50 cursor-pointer bg-white'
          }`}
      >
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 transition-colors
          ${uploadState === 'scanning' ? 'bg-red-100' : 'bg-gray-100 group-hover:bg-red-100'}`}
        >
          {uploadState === 'scanning' ? (
            <svg className="w-5 h-5 text-miami-red animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : '📷'}
        </div>
        <div className="text-left flex-1 min-w-0">
          <p className={`text-sm font-bold transition-colors ${uploadState === 'scanning' ? 'text-miami-red' : 'text-gray-700 group-hover:text-miami-red'}`}>
            {uploadState === 'scanning'
              ? (import.meta.env.VITE_ANTHROPIC_API_KEY && import.meta.env.VITE_ANTHROPIC_API_KEY !== 'your-api-key-here'
                  ? `AI reading your transcript… ${scanProgress > 0 ? `${scanProgress}%` : ''}`
                  : `Scanning… ${scanProgress > 0 ? `${scanProgress}%` : ''}`)
              : 'Snap or upload your transcript'}
          </p>
          {uploadState === 'scanning' ? (
            <div className="mt-1.5 h-1.5 w-full bg-red-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-miami-red rounded-full transition-all duration-300"
                style={{ width: `${scanProgress}%` }}
              />
            </div>
          ) : (
            <p className="text-xs text-gray-400 mt-0.5">
              Photo, screenshot, or PDF — we'll pull every course code automatically
            </p>
          )}
        </div>
        {uploadState === 'idle' && (
          <div className="ml-auto flex-shrink-0">
            <span className="text-xs font-semibold text-miami-red bg-red-50 group-hover:bg-red-100 px-2.5 py-1 rounded-full border border-red-100 transition-colors">
              Easiest
            </span>
          </div>
        )}
      </button>

      {/* Photo scan results */}
      {uploadState === 'done' && photoFound.length > 0 && (
        <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
              <span>✅</span> Found {photoFound.length} course{photoFound.length !== 1 ? 's' : ''} in your transcript
            </p>
            <button
              onClick={confirmAllPhoto}
              className="text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 px-3 py-1.5 rounded-full transition-colors"
            >
              Add all
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {photoFound.map(p => (
              <div key={p.code} className="inline-flex items-center gap-1">
                <button
                  onClick={() => { confirm(p); dismissPhoto(p.code) }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white border border-emerald-200 text-emerald-800 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all"
                >
                  <span className="opacity-60">✓</span> {p.code}
                  <span className="opacity-60 font-normal">· {p.name}</span>
                  {p.credits && <span className="opacity-50 font-normal">({p.credits} cr)</span>}
                </button>
                <button
                  onClick={() => dismissPhoto(p.code)}
                  className="text-emerald-300 hover:text-emerald-600 transition-colors text-sm px-1"
                  aria-label="Dismiss"
                >×</button>
              </div>
            ))}
          </div>
          {ocrRawText && (
            <p className="text-xs text-emerald-600 mt-2.5 opacity-60">
              Not seeing a course? Use the text box below to add it manually.
            </p>
          )}
        </div>
      )}

      {/* No courses found state */}
      {uploadState === 'notfound' && (
        <div className="mb-4 p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
          <span className="text-lg mt-0.5">🔍</span>
          <div>
            <p className="text-xs font-bold text-amber-700">No course codes found in that image</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Try a clearer photo with better lighting, or type your courses in the box below.
            </p>
            <button
              onClick={() => { setUploadState('idle'); fileInputRef.current?.click() }}
              className="text-xs font-semibold text-amber-700 underline mt-1"
            >Try another photo</button>
          </div>
        </div>
      )}

      {/* OCR error state */}
      {uploadState === 'error' && (
        <div className="mb-4 p-3.5 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3">
          <span className="text-lg mt-0.5">⚠️</span>
          <div>
            <p className="text-xs font-bold text-red-700">Couldn't read that file</p>
            <p className="text-xs text-red-500 mt-0.5">Try a JPG or PNG photo, or type your courses below.</p>
            <button
              onClick={() => { setUploadState('idle'); fileInputRef.current?.click() }}
              className="text-xs font-semibold text-red-600 underline mt-1"
            >Try again</button>
          </div>
        </div>
      )}

      {/* "or type them" divider */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-px bg-gray-100" />
        <span className="text-xs text-gray-300 font-medium">or type them</span>
        <div className="flex-1 h-px bg-gray-100" />
      </div>

      {/* Conversational textarea */}
      <div className="relative">
        <textarea
          className="w-full px-4 py-3.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-miami-red/30 focus:border-miami-red transition-all text-gray-900 placeholder-gray-300 resize-none text-sm leading-relaxed"
          rows={3}
          placeholder={'Try: "I did calc 1 and 2, intro psych, and english comp freshman year"\nor: "Took CSE 174 and 271 last semester"\nor just list them: "bio 1, chem 1, stats"'}
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
        {inputText && (
          <div className="absolute bottom-3 right-3 text-xs text-gray-300 pointer-events-none">
            Press Enter to confirm
          </div>
        )}
      </div>

      {/* Parsed suggestions (in-flight) */}
      {parsed.length > 0 && (
        <div className="mt-3 p-3.5 bg-blue-50 border border-blue-100 rounded-xl">
          <p className="text-xs font-semibold text-blue-600 mb-2.5 flex items-center gap-1.5">
            <span>✨</span> We think you mean — confirm or dismiss:
          </p>
          <div className="flex flex-wrap gap-2">
            {parsed.map(p => (
              <div key={p.code} className="inline-flex items-center gap-1">
                <button
                  onClick={() => confirm(p)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white border border-blue-200 text-blue-800 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all"
                >
                  <span className="opacity-60">✓</span> {p.code} · {p.name}
                </button>
                <button
                  onClick={() => rejectParsed(p.code)}
                  className="text-blue-300 hover:text-blue-600 transition-colors text-sm px-1"
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirmed courses */}
      {hasAnything && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wide">
            Added · {confirmedCodes.length} course{confirmedCodes.length !== 1 ? 's' : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            {confirmedCodes.map(code => {
              const entry = getCourseByCode(code)
              return (
                <CourseChip
                  key={code}
                  code={code}
                  name={entry?.name || code}
                  onRemove={() => remove(code)}
                  variant="confirmed"
                />
              )
            })}
          </div>
        </div>
      )}

      {/* Major-specific proactive suggestions */}
      {majorSuggestions.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-400 mb-2.5 uppercase tracking-wide flex items-center gap-1.5">
            <span>💡</span>
            {data.major ? `Common for ${data.major} students` : 'Common courses'}
          </p>
          <div className="flex flex-wrap gap-2">
            {majorSuggestions.map(code => {
              const entry = getCourseByCode(code)
              return (
                <SuggestionChip
                  key={code}
                  code={code}
                  name={entry?.name || code}
                  onAdd={() => addByCode(code)}
                />
              )
            })}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-300 text-center mt-4">
        {hasAnything
          ? "We'll skip these in your recommendations and check prerequisites automatically."
          : "Skip if you're just starting out — we'll assume you're eligible for intro courses."}
      </p>
    </div>
  )
}

// ── Step 3: Preferences ───────────────────────────────────────────────────────

function Step3({ data, setData }) {
  const interests = data.interests || []
  const timePrefs = data.timePrefs || []
  const avoidDays = data.avoidDays || []

  const toggleTime = (id) => setData(d => ({
    ...d,
    timePrefs: timePrefs.includes(id) ? timePrefs.filter(x => x !== id) : [...timePrefs, id],
  }))

  const toggleInterest = (id) => setData(d => ({
    ...d,
    interests: interests.includes(id) ? interests.filter(x => x !== id) : [...interests, id],
  }))

  const toggleDay = (day) => setData(d => ({
    ...d,
    avoidDays: avoidDays.includes(day) ? avoidDays.filter(x => x !== day) : [...avoidDays, day],
  }))

  return (
    <div>
      <div className="text-center mb-7">
        <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-3">⚙️</div>
        <h2 className="text-2xl font-extrabold text-gray-900 dark:text-gray-50 mb-1.5">How do you like your schedule?</h2>
        <p className="text-gray-400 text-sm">All optional — skip anything you don't care about.</p>
      </div>

      <div className="space-y-6">
        {/* Time of day */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2.5">
            Best time for classes
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { id: 'morning',   label: 'Morning',   sub: '8–11am',  icon: '🌅' },
              { id: 'midday',    label: 'Midday',    sub: '11am–1pm', icon: '☀️' },
              { id: 'afternoon', label: 'Afternoon', sub: '1–5pm',   icon: '🌤' },
              { id: 'evening',   label: 'Evening',   sub: '5pm+',    icon: '🌙' },
            ].map(t => (
              <button
                key={t.id}
                className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-center transition-all ${
                  timePrefs.includes(t.id)
                    ? 'border-miami-red bg-red-50 dark:bg-red-950/40 text-miami-red'
                    : 'border-gray-100 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-200 dark:hover:border-gray-600 bg-gray-50 dark:bg-gray-800'
                }`}
                onClick={() => toggleTime(t.id)}
              >
                <span className="text-xl">{t.icon}</span>
                <span className="text-xs font-bold">{t.label}</span>
                <span className="text-xs opacity-50">{t.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Workload */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2.5">Workload this semester</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'light',    label: 'Take it easy',  sub: 'More free time',  icon: '😌' },
              { id: 'moderate', label: 'Balanced',      sub: 'Best of both',    icon: '😊' },
              { id: 'heavy',    label: 'Grind mode',    sub: 'Bring it on',     icon: '💪' },
            ].map(w => (
              <button
                key={w.id}
                className={`flex flex-col items-center gap-1.5 p-3.5 rounded-xl border-2 text-center transition-all ${
                  data.workload === w.id
                    ? 'border-miami-red bg-red-50 dark:bg-red-950/40 text-miami-red'
                    : 'border-gray-100 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-200 dark:hover:border-gray-600 bg-gray-50 dark:bg-gray-800'
                }`}
                onClick={() => setData(d => ({ ...d, workload: w.id }))}
              >
                <span className="text-2xl">{w.icon}</span>
                <span className="text-xs font-bold">{w.label}</span>
                <span className="text-xs opacity-50">{w.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Credit hours */}
        <div>
          <div className="flex justify-between items-baseline mb-2.5">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Target credit hours</label>
            <span className="text-miami-red font-black text-lg">{data.credits || 15} <span className="text-xs text-gray-400 font-normal">credits</span></span>
          </div>
          <input
            type="range" min={9} max={21} step={1}
            value={data.credits || 15}
            onChange={e => setData(d => ({ ...d, credits: Number(e.target.value) }))}
            className="w-full accent-miami-red h-2 cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-300 mt-1">
            <span>9 (light)</span><span>15 (standard)</span><span>21 (max)</span>
          </div>
        </div>

        {/* Interests */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
            Elective interests <span className="text-gray-300 font-normal normal-case">(pick any)</span>
          </label>
          <p className="text-xs text-gray-300 mb-2.5">Helps surface electives you'll actually enjoy.</p>
          <div className="grid grid-cols-2 gap-2">
            {INTERESTS.map(i => (
              <button
                key={i.id}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-left transition-all ${
                  interests.includes(i.id)
                    ? 'border-miami-red bg-red-50 dark:bg-red-950/40 text-miami-red'
                    : 'border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-200 dark:hover:border-gray-600 bg-gray-50 dark:bg-gray-800'
                }`}
                onClick={() => toggleInterest(i.id)}
              >
                <span className="text-lg">{i.icon}</span>
                <span className="text-xs font-semibold leading-tight">{i.label}</span>
                {interests.includes(i.id) && <span className="ml-auto text-miami-red text-xs">✓</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Avoid days */}
        <div>
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2.5">
            Days to avoid <span className="text-gray-300 font-normal normal-case">(optional)</span>
          </label>
          <div className="flex gap-2 flex-wrap">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => (
              <button
                key={day}
                className={`px-4 py-2 rounded-xl border-2 text-sm font-bold transition-all min-w-[56px] ${
                  avoidDays.includes(day)
                    ? 'border-gray-700 bg-gray-800 dark:bg-gray-700 text-white'
                    : 'border-gray-100 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:border-gray-300 dark:hover:border-gray-600 bg-gray-50 dark:bg-gray-800'
                }`}
                onClick={() => toggleDay(day)}
              >
                {day}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Onboarding ───────────────────────────────────────────────────────────

export default function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)

  // Pre-fill from saved profile so returning users don't re-enter
  const saved = loadProfile()
  const [data, setData] = useState({
    major:            saved?.major            || '',
    concentration:    saved?.concentration    || '',
    minor:            saved?.minor            || '',
    year:             saved?.year             || '',
    completedCourses: saved?.completedCourses || [],
    timePrefs:        saved?.timePrefs        || [],
    workload:         saved?.workload         || 'moderate',
    credits:          saved?.credits          || 15,
    interests:        saved?.interests        || [],
    avoidDays:        saved?.avoidDays        || [],
  })

  const canAdvance = () => {
    if (step === 1) return !!data.major && !!data.year
    return true
  }

  const advance = () => {
    if (step < STEPS.length) {
      setStep(s => s + 1)
    } else {
      // Persist profile before navigating so Schedule page can load it immediately
      saveProfile(data)
      navigate('/results', { state: { preferences: data } })
    }
  }

  const back = () => step > 1 && setStep(s => s - 1)

  const stepHeadline = ['', "Let's find your major", 'What have you covered?', 'Your schedule vibe'][step]

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900 flex items-start justify-center py-10 px-4 transition-colors duration-200">
      <div className="w-full max-w-lg">
        {/* Top label */}
        <p className="text-center text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">{stepHeadline}</p>
        <StepDots current={step} />

        <div className="card p-6 sm:p-8 shadow-md border-gray-100 dark:border-gray-700">
          {step === 1 && <Step1 data={data} setData={setData} />}
          {step === 2 && <Step2 data={data} setData={setData} />}
          {step === 3 && <Step3 data={data} setData={setData} />}

          {/* Navigation */}
          <div className="flex gap-2.5 mt-8">
            {step > 1 && (
              <button
                onClick={back}
                className="flex-none px-4 py-3 rounded-xl text-sm font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                ←
              </button>
            )}
            <button
              onClick={advance}
              disabled={!canAdvance()}
              className={`flex-1 py-3.5 px-6 rounded-xl text-sm font-bold transition-all duration-200 ${
                canAdvance()
                  ? 'bg-miami-red text-white hover:bg-miami-red-dark shadow-sm hover:shadow-md active:scale-[0.98]'
                  : 'bg-gray-100 text-gray-300 cursor-not-allowed'
              }`}
            >
              {step === STEPS.length ? '🚀 Find my courses →' : 'Continue →'}
            </button>
          </div>

          {(step === 2 || step === 3) && (
            <button
              onClick={advance}
              className="w-full mt-2 text-center text-xs text-gray-300 hover:text-gray-500 transition-colors py-1.5"
            >
              Skip this step
            </button>
          )}
        </div>

        {/* Reassurance */}
        <p className="text-center text-xs text-gray-300 mt-4">
          {step === 1 && 'You can update this anytime from results.'}
          {step === 2 && "No worries if you miss some — we'll flag prerequisites."}
          {step === 3 && 'These preferences tune your results but never filter anything out.'}
        </p>
      </div>
    </div>
  )
}
