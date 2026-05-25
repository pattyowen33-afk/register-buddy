/**
 * Cron scheduler — re-runs the scraper weekly on Sunday at 3am
 * - Sunday 3:00am: bulletin catalog scrape (course names/descriptions)
 * - Sunday 3:30am: live section scrape (real CRNs, seats, schedules)
 *
 * Start alongside the API server (already included in server/index.js)
 */

const cron = require('node-cron')
const { run } = require('./index')
const { scrapeAllSections, seedLiveSections } = require('./live-scraper')

function startScheduler() {
  console.log('📅 Scraper cron scheduled: Sundays at 3:00am (catalog) + 3:30am (live sections)')

  // Sunday 3:00am — bulletin catalog (course descriptions)
  cron.schedule('0 3 * * 0', async () => {
    console.log(`\n[${new Date().toISOString()}] Running scheduled catalog scrape...`)
    try {
      await run()
      console.log(`[${new Date().toISOString()}] Catalog scrape complete.`)
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Catalog scrape FAILED:`, err.message)
    }
  })

  // Sunday 3:30am — live sections from courselist
  cron.schedule('30 3 * * 0', async () => {
    console.log(`\n[${new Date().toISOString()}] Running scheduled live section scrape...`)
    try {
      const sections = await scrapeAllSections()
      if (sections.length > 0) {
        const count = seedLiveSections(sections)
        console.log(`[${new Date().toISOString()}] Live section scrape complete: ${count} sections saved.`)
      } else {
        console.warn(`[${new Date().toISOString()}] Live scrape returned 0 sections — skipping DB update.`)
      }
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Live section scrape FAILED:`, err.message)
    }
  })
}

module.exports = { startScheduler }
