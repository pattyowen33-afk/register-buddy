/**
 * API Discovery Tool
 * Opens apps.miamioh.edu/courselist in a headless browser,
 * submits a CSE search, and logs every XHR/fetch request made.
 * Run once to find the real API endpoint, then hardcode it in scraper.js
 *
 * node server/scraper/discover-api.js
 */

const puppeteer = require('puppeteer')

async function discover() {
  console.log('Launching browser...')
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  const page = await browser.newPage()
  const requests = []

  // Intercept ALL network requests
  await page.setRequestInterception(true)
  page.on('request', req => {
    const url = req.url()
    const method = req.method()
    const type = req.resourceType()
    // Only care about XHR/fetch, not images/css/fonts
    if (['xhr', 'fetch'].includes(type)) {
      requests.push({ method, url, type, postData: req.postData() || null })
      console.log(`[${method}] ${url}`)
    }
    req.continue()
  })

  page.on('response', async res => {
    const url = res.url()
    const type = res.headers()['content-type'] || ''
    if (type.includes('json') && !url.includes('analytics') && !url.includes('google')) {
      try {
        const text = await res.text()
        const preview = text.slice(0, 300).replace(/\s+/g, ' ')
        console.log(`\n📦 JSON response from: ${url}\n   Preview: ${preview}\n`)
      } catch { /* ignore */ }
    }
  })

  console.log('Navigating to courselist...')
  await page.goto('https://www.apps.miamioh.edu/courselist/', {
    waitUntil: 'networkidle2',
    timeout: 30000,
  })

  console.log('\nPage loaded. Looking for term dropdown...')

  // Try to select the first available term
  try {
    await page.waitForSelector('select', { timeout: 8000 })
    const selects = await page.$$eval('select', els => els.map(s => ({
      name: s.name || s.id || s.className,
      options: [...s.options].map(o => ({ value: o.value, text: o.text })).slice(0, 5),
    })))
    console.log('\nDropdowns found:', JSON.stringify(selects, null, 2))
  } catch (e) {
    console.log('No select found:', e.message)
  }

  // Try to find any search/submit button and click it
  try {
    await page.waitForSelector('button[type=submit], input[type=submit], button', { timeout: 5000 })

    // Set subject to CSE if possible
    await page.evaluate(() => {
      const selects = document.querySelectorAll('select')
      for (const s of selects) {
        for (const opt of s.options) {
          if (opt.value === 'CSE' || opt.text === 'Computer Science & Software Engineering') {
            s.value = opt.value
            s.dispatchEvent(new Event('change', { bubbles: true }))
            break
          }
        }
      }
    })

    await new Promise(r => setTimeout(r, 1000))

    // Click the search button
    await page.evaluate(() => {
      const btn = document.querySelector('button[type=submit]') ||
                  document.querySelector('input[type=submit]') ||
                  [...document.querySelectorAll('button')].find(b => /search|submit|find/i.test(b.textContent))
      if (btn) btn.click()
    })

    console.log('\nSearch submitted, waiting for results...')
    await new Promise(r => setTimeout(r, 5000))

  } catch (e) {
    console.log('Could not submit search:', e.message)
  }

  console.log('\n\n=== All XHR/Fetch requests captured ===')
  for (const r of requests) {
    console.log(`\n[${r.method}] ${r.url}`)
    if (r.postData) console.log(`  Body: ${r.postData.slice(0, 200)}`)
  }

  // Also dump page source for inspection
  const html = await page.content()
  require('fs').writeFileSync(
    require('path').join(__dirname, 'courselist-source.html'),
    html
  )
  console.log('\n📄 Full page source saved to server/scraper/courselist-source.html')

  await browser.close()
}

discover().catch(e => { console.error(e); process.exit(1) })
