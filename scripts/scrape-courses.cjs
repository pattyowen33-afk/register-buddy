/**
 * Miami University Course Catalog Scraper
 * Fetches all courses from bulletin.miamioh.edu and outputs src/data/courses.json
 *
 * Run: node scripts/scrape-courses.js
 */

const https = require('https')
const fs = require('fs')
const path = require('path')

// All departments from bulletin.miamioh.edu/courses-instruction/
const DEPARTMENTS = [
  { name: 'Accountancy', code: 'ACC' },
  { name: 'Aerospace Studies', code: 'AES' },
  { name: 'American Culture & English Program', code: 'ACE' },
  { name: 'American Studies', code: 'AMS' },
  { name: 'Anthropology', code: 'ATH' },
  { name: 'Applied Communication', code: 'APC' },
  { name: 'Applied Social Research', code: 'ASO' },
  { name: 'Arabic', code: 'ARB' },
  { name: 'Architecture & Interior Design', code: 'ARC' },
  { name: 'Art', code: 'ART' },
  { name: 'Arts and Science', code: 'CAS' },
  { name: 'Asian/Asian American Studies', code: 'AAA' },
  { name: 'Biological Sciences', code: 'BSC' },
  { name: 'Biology', code: 'BIO' },
  { name: 'Business Analysis', code: 'BUS' },
  { name: 'Business Legal Studies', code: 'BLS' },
  { name: 'Chemical, Paper & Biomedical Engineering', code: 'CPB' },
  { name: 'Chemistry & Biochemistry', code: 'CHM' },
  { name: 'Chinese', code: 'CHI' },
  { name: 'Classics', code: 'CLS' },
  { name: 'Commerce', code: 'CMR' },
  { name: 'Community Arts', code: 'CMA' },
  { name: 'Comparative Media Studies', code: 'CMS' },
  { name: 'Computer and Information Technology', code: 'CIT' },
  { name: 'Computer Science & Software Engineering', code: 'CSE' },
  { name: 'Creative Arts', code: 'CCA' },
  { name: 'Criminal Justice Studies', code: 'CJS' },
  { name: 'Critical Race and Ethnic Studies', code: 'CRE' },
  { name: 'Cybersecurity', code: 'CYB' },
  { name: 'Disability Studies', code: 'DST' },
  { name: 'Economics', code: 'ECO' },
  { name: 'Educational Leadership', code: 'EDL' },
  { name: 'Educational Psychology', code: 'EDP' },
  { name: 'Education, Health and Society', code: 'EHS' },
  { name: 'Electrical & Computer Engineering', code: 'ECE' },
  { name: 'Emerging Technology in Business + Design', code: 'IMS' },
  { name: 'Engineering & Computing', code: 'CEC' },
  { name: 'Engineering Management', code: 'EGM' },
  { name: 'Engineering Technology', code: 'ENT' },
  { name: 'English', code: 'ENG' },
  { name: 'English Language Program', code: 'ELP' },
  { name: 'English Studies', code: 'EGS' },
  { name: 'Entrepreneurship', code: 'ESP' },
  { name: 'Environmental Sciences', code: 'IES' },
  { name: 'Family Science and Social Work', code: 'FSW' },
  { name: 'Fashion', code: 'FAS' },
  { name: 'Film Studies', code: 'FST' },
  { name: 'Finance', code: 'FIN' },
  { name: 'French', code: 'FRE' },
  { name: 'Geography', code: 'GEO' },
  { name: 'Geology', code: 'GLG' },
  { name: 'German', code: 'GER' },
  { name: 'Gerontology', code: 'GTY' },
  { name: 'Global Health Studies', code: 'GHS' },
  { name: 'Global & Intercultural Studies', code: 'GIC' },
  { name: 'Greek Language and Literature', code: 'GRK' },
  { name: 'History', code: 'HST' },
  { name: 'Honors', code: 'HON' },
  { name: 'Humanities Center', code: 'HUM' },
  { name: 'Information Systems & Analytics', code: 'ISA' },
  { name: 'Integrative Studies', code: 'BIS' },
  { name: 'Interdisciplinary', code: 'IDS' },
  { name: 'International Studies', code: 'ITS' },
  { name: 'Italian', code: 'ITL' },
  { name: 'Japanese', code: 'JPN' },
  { name: 'Journalism', code: 'JRN' },
  { name: 'Kinesiology, Nutrition, and Health', code: 'KNH' },
  { name: 'Korean', code: 'KOR' },
  { name: 'Latin American Studies', code: 'LAS' },
  { name: 'Latin Language & Literature', code: 'LAT' },
  { name: 'Liberal Studies', code: 'LST' },
  { name: 'Linguistics', code: 'LIN' },
  { name: 'Management', code: 'MGT' },
  { name: 'Marketing', code: 'MKT' },
  { name: 'Mathematics', code: 'MTH' },
  { name: 'Mechanical & Manufacturing Engineering', code: 'MME' },
  { name: 'Media and Communication', code: 'MAC' },
  { name: 'Medical Science', code: 'MMS' },
  { name: 'Microbiology', code: 'MBI' },
  { name: 'Military Science', code: 'MSC' },
  { name: 'Music', code: 'MUS' },
  { name: 'Naval Science', code: 'NSC' },
  { name: 'Nonprofit and Community Studies', code: 'NCS' },
  { name: 'Nursing', code: 'NSG' },
  { name: 'Organizational Leadership', code: 'ORG' },
  { name: 'Philosophy', code: 'PHL' },
  { name: 'Physics', code: 'PHY' },
  { name: 'Political Science', code: 'POL' },
  { name: 'Portuguese', code: 'POR' },
  { name: 'Psychological Science', code: 'PSS' },
  { name: 'Psychology', code: 'PSY' },
  { name: 'Religion, Comparative', code: 'REL' },
  { name: 'Russian', code: 'RUS' },
  { name: 'Social Justice Studies', code: 'SJS' },
  { name: 'Sociology', code: 'SOC' },
  { name: 'Spanish', code: 'SPN' },
  { name: 'Speech Pathology & Audiology', code: 'SPA' },
  { name: 'Sport Leadership and Management', code: 'SLM' },
  { name: 'Statistics', code: 'STA' },
  { name: 'Strategic Communication', code: 'STC' },
  { name: 'Teaching, Curriculum & Educational Inquiry', code: 'TCE' },
  { name: 'Theatre', code: 'THE' },
  { name: 'Women\'s, Gender & Sexuality Studies', code: 'WGS' },
]

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 RegisterBuddy/1.0' } }, (res) => {
      // Follow redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchPage(res.headers.location).then(resolve).catch(reject)
      }
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve(data))
      res.on('error', reject)
    }).on('error', reject)
  })
}

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, '')
    .replace(/&[a-z]+;/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function generateAliases(code, name, deptName) {
  const aliases = []
  const dept = code.split(' ')[0].toLowerCase()
  const num = code.split(' ')[1]
  const nameLower = name.toLowerCase()

  // Always include the raw code variants
  aliases.push(`${dept} ${num}`)       // "mth 151"
  aliases.push(`${dept}${num}`)        // "mth151"

  // Add full lowercase name
  aliases.push(nameLower)

  // Common shortening patterns
  const shorteners = [
    [/\bintroduction to\b/g, 'intro to'],
    [/\bintroduction\b/g, 'intro'],
    [/\bfundamentals of\b/g, 'fundamentals'],
    [/\bprinciples of\b/g, 'principles'],
    [/\badvanced\b/g, 'adv'],
    [/calculus i\b/g, 'calc 1'],
    [/calculus ii\b/g, 'calc 2'],
    [/calculus iii\b/g, 'calc 3'],
    [/\band\b/g, '&'],
  ]

  let shortened = nameLower
  for (const [pattern, replacement] of shorteners) {
    shortened = shortened.replace(pattern, replacement)
  }
  if (shortened !== nameLower) aliases.push(shortened)

  // For calculus specifically
  if (/calculus i\b/i.test(name) && !/ii|iii/i.test(name)) {
    aliases.push('calc 1', 'calc i', 'calculus 1')
  }
  if (/calculus ii\b/i.test(name)) {
    aliases.push('calc 2', 'calc ii', 'calculus 2')
  }
  if (/calculus iii\b/i.test(name)) {
    aliases.push('calc 3', 'calc iii', 'calculus 3')
  }

  // Remove duplicates
  return [...new Set(aliases)].filter(a => a.length > 2)
}

function parseCoursesFromHtml(html, deptCode, deptName) {
  const courses = []

  // The bulletin uses <p> tags with <strong> for course headers
  // Pattern: DEPT NNN[suffix]. Course Title. (Credits)
  // Also handles combined listings like CSE 401/501
  const coursePattern = new RegExp(
    `(${deptCode}\\s+\\d{3}[A-Z]?(?:\\/\\d{3}[A-Z]?)?)\\s*\\.\\s*([^.(]+?)\\s*\\.\\s*\\((\\d[^)]*?)\\)`,
    'gi'
  )

  // Also extract descriptions - find text between course headers
  const allText = stripHtml(html)

  let match
  while ((match = coursePattern.exec(allText)) !== null) {
    const rawCode = match[1].replace(/\s+/g, ' ').trim().toUpperCase()
    // For combined codes like CSE 401/501, use the lower (undergrad) number
    const primaryCode = rawCode.includes('/')
      ? rawCode.split('/')[0].trim()
      : rawCode

    const name = match[2].trim()
    const creditsRaw = match[3].trim()

    // Skip graduate-only courses (600+) and special/independent study entries
    const courseNum = parseInt(primaryCode.match(/\d+/)?.[0] || '0')
    if (courseNum >= 600) continue
    if (/independent stud|internship|research for thesis|doctoral research|non-thesis/i.test(name)) continue

    // Parse credits
    let credits = null
    if (creditsRaw.includes('-')) {
      const parts = creditsRaw.split('-').map(n => parseInt(n))
      credits = parts[0] // use minimum
    } else {
      credits = parseInt(creditsRaw) || null
    }

    // Get description snippet - find next ~200 chars after this course header
    const headerEnd = match.index + match[0].length
    const descSnippet = allText.slice(headerEnd, headerEnd + 300).trim()
    const firstSentence = descSnippet.split(/\.\s/)[0].replace(/\s+/g, ' ').trim()

    const aliases = generateAliases(primaryCode, name, deptName)

    courses.push({
      code: primaryCode,
      name,
      credits,
      department: deptName,
      description: firstSentence.length > 10 ? firstSentence : null,
      aliases,
    })
  }

  return courses
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function scrapeAll() {
  const allCourses = []
  const errors = []

  console.log(`Scraping ${DEPARTMENTS.length} departments...\n`)

  for (let i = 0; i < DEPARTMENTS.length; i++) {
    const dept = DEPARTMENTS[i]
    const url = `https://bulletin.miamioh.edu/courses-instruction/${dept.code.toLowerCase()}/`

    process.stdout.write(`[${i + 1}/${DEPARTMENTS.length}] ${dept.code} - ${dept.name}... `)

    try {
      const html = await fetchPage(url)
      const courses = parseCoursesFromHtml(html, dept.code, dept.name)
      allCourses.push(...courses)
      console.log(`${courses.length} courses`)
    } catch (err) {
      console.log(`ERROR: ${err.message}`)
      errors.push({ dept: dept.code, error: err.message })
    }

    // Polite delay between requests
    if (i < DEPARTMENTS.length - 1) await sleep(300)
  }

  console.log(`\n✅ Total courses scraped: ${allCourses.length}`)
  if (errors.length > 0) {
    console.log(`⚠️  Errors on ${errors.length} departments:`, errors.map(e => e.dept).join(', '))
  }

  // Write output
  const outDir = path.join(__dirname, '..', 'src', 'data')
  fs.mkdirSync(outDir, { recursive: true })

  const outPath = path.join(outDir, 'courses.json')
  fs.writeFileSync(outPath, JSON.stringify(allCourses, null, 2))
  console.log(`\n📁 Written to ${outPath}`)
  console.log(`   ${allCourses.length} courses across ${DEPARTMENTS.length} departments`)
}

scrapeAll().catch(console.error)
