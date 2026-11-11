#!/usr/bin/env node
/**
 * Live-PWA DOM smoke (live-smoke.yml -> live-web-smoke job).
 *
 * Verifies the deployed web app against the live API at DOM level - the class
 * of breakage status-code probes cannot see (stale bundles, JS runtime errors,
 * missing states, chips never resolving). These defects have only ever been
 * caught by hand; this script makes the next TIR-312-style regression fail CI.
 *
 * Design rules (both directions matter):
 *  - Real failures MUST fail the job (a broken PWA is not launch-quality).
 *  - Trust-contract variation (an airport having no data yet, so no chips)
 *    must NOT fail the job - that is a data state, not a defect.
 *  - Render cold starts / transient deploys are tolerated with 3 attempts
 *    (45s apart), matching the existing probe cushioning.
 */
import { chromium } from 'playwright'

const BASE = process.env.LIVE_WEB_URL || 'https://flyby-web.onrender.com'
const ATTEMPTS = 3
const ATTEMPT_DELAY_MS = 45_000

const fail = (msg) => {
  console.error(`::error::${msg}`)
  throw new Error(msg)
}

// The PWA's default landing view is the Dashboard; the search + report flow
// lives on its own "Search & Report" tab (TIR-317). Selectors such as
// #airport-search only exist once that tab is active, and a reload resets the
// SPA back to the Dashboard - so navigate here before probing the search UI.
async function openSearchTab(page) {
  const tab = page.getByRole('button', { name: 'Search & Report' })
  await tab.waitFor({ state: 'visible', timeout: 60_000 })
  await tab.click()
}

async function attempt(n) {
  const browser = await chromium.launch()
  const errors = []
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

  try {
        console.log(`[attempt ${n}] loading ${BASE} ...`)
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120_000 })
    await page.waitForFunction(
      () => document.getElementById('root') !== null,
      { timeout: 60_000 }
    )
    // TIR-379 acceptance: prove the Dashboard actually mounted (not just that
    // the nav button exists) before navigating away from it.
    await page.waitForSelector('#dashboard-filter', { state: 'visible', timeout: 60_000 })
    await openSearchTab(page)
    await page.waitForSelector('#airport-search', { state: 'visible', timeout: 60_000 })

    // Default airport (SEA): checkpoint cards must render
    await page.waitForSelector('article', { timeout: 60_000 })
    const cards = await page.locator('article').count()
    if (cards < 1) fail(`default airport rendered ${cards} cards (expected >= 1)`)
    console.log(`  cards: ${cards}`)

    // Forecast enrichment must settle: after the batched forecasts call the
    // UI either shows chips (data exists) or has resolved to no skeletons and
    // no crash (data honestly absent).
    const skelDeadline = Date.now() + 45_000
    let skeletons = -1
    for (;;) {
      skeletons = await page.locator('[data-testid="best-time-skeleton"]').count()
      if (skeletons === 0) break
      if (Date.now() > skelDeadline) fail(`${skeletons} best-time skeleton(s) never resolved`)
      await page.waitForTimeout(500)
    }
    const chips = await page.locator('[data-testid="best-time-chip"]').count()
    console.log(`  chips settled: ${chips} chip(s), 0 skeleton(s) left`)
    if (chips > 0) {
      const text = (await page.locator('[data-testid="best-time-chip"]').first().textContent()) ?? ''
      if (!/^Best ~\d+ (AM|PM) · \d+ min$/.test(text.trim())) {
        fail(`chip text off-contract: ${JSON.stringify(text)}`)
      }
    }

    // Zero unsupported-airport gap: ATL search yields a result and the empty
    // state carries a working Report entry point (first report anywhere).
    await page.fill('#airport-search', 'ATL')
    await page.click('text=Hartsfield-Jackson', { timeout: 30_000 })
    await page.waitForSelector('[data-testid="empty-report-button"]', { timeout: 45_000, state: 'visible' })
    console.log('  ATL: search result + empty-state report button present')

    // TIR-326 companion: the empty state must list the real checkpoints so a
    // traveler knows what to look for - the funnel affordance, not a dead end.
    const knownNames = await page.locator('[data-testid="known-checkpoints"] li').allTextContents()
    if (knownNames.length < 1) fail('ATL empty state lists no known checkpoints')
    if (!knownNames.some((n) => n.includes('Domestic'))) {
      fail(`ATL known-checkpoints list does not look like ATL data: ${JSON.stringify(knownNames.slice(0, 3))}`)
    }
    console.log(`  ATL: ${knownNames.length} known checkpoints listed`)

    // Report sheet contract (zero writes): opening the sheet from the empty
    // state must yield a picker populated with the airport's real checkpoints
    // and a submit-affordance gated on them. Close without submitting - no
    // report is ever written by this probe.
    await page.click('[data-testid="empty-report-button"]')
    await page.waitForSelector('[data-testid="checkpoint-picker"]', { timeout: 15_000, state: 'visible' })
    const pickerOptions = await page.locator('[data-testid="checkpoint-picker"] option').allTextContents()
    if (pickerOptions.length < 1) fail('checkpoint picker opened with zero options')
    if (!pickerOptions.some((o) => o.includes('Domestic'))) {
      fail(`checkpoint picker options mismatch ATL data: ${JSON.stringify(pickerOptions.slice(0, 3))}`)
    }
    console.log(`  ATL picker: ${pickerOptions.length} options (write path usable, no report written)`)
    await page.locator('[aria-label="Close"]').click()
    await page.waitForSelector('[data-testid="checkpoint-picker"]', { state: 'detached', timeout: 15_000 })

    if (errors.length > 0) fail(`console errors: ${errors.join(' | ')}`)

    // PWA contract (TIR-323 follow-on): the manifest is only half of
    // installability; the shell must keep loading with the network gone -
    // airport WiFi is exactly that. A service worker only caches what it was
    // CONTROLLING during (the first load predates control), so model the real
    // traveler's second visit: activate, reload once online (assets cached
    // under SW control), then reload offline and require the shell to mount.
    await page.waitForFunction(
      () => navigator.serviceWorker?.controller != null,
      { timeout: 30_000 },
    )
    await page.reload({ waitUntil: 'domcontentloaded' })
    // A reload resets the SPA to the Dashboard tab; re-enter Search & Report.
    await openSearchTab(page)
    await page.waitForSelector('article', { timeout: 60_000 })
    await page.context().setOffline(true)
    await page.reload({ waitUntil: 'domcontentloaded' })
    // Offline: the SW-cached shell must mount. Navigating the shell offline is
    // the real airport-WiFi assertion; the search UI follows once it is up.
    await openSearchTab(page)
    await page.waitForSelector('#airport-search', { timeout: 30_000 })
    console.log('  offline: shell cached by the SW, mounted with the network down')
    await page.context().setOffline(false)

    // Mobile viewport (TIR-379 acceptance): at 375px the app must still land
    // on the Dashboard, reach Search & Report, and mount the search UI.
    const mobile = await browser.newPage({ viewport: { width: 375, height: 812 } })
    try {
      await mobile.goto(BASE, { waitUntil: 'networkidle', timeout: 120_000 })
      await mobile.waitForSelector('#dashboard-filter', { state: 'visible', timeout: 60_000 })
      await openSearchTab(mobile)
      await mobile.waitForSelector('#airport-search', { state: 'visible', timeout: 60_000 })
      console.log('  mobile 375px: dashboard lands, Search & Report reachable, search UI mounts')
    } finally {
      await mobile.close()
    }

    console.log(`[attempt ${n}] all live web checks passed`)
    return
  } finally {
    await browser.close()
  }
}

for (let n = 1; n <= ATTEMPTS; n++) {
  try {
    await attempt(n)
    process.exit(0)
  } catch (err) {
    console.error(`attempt ${n} failed: ${err.message}`)
    if (n < ATTEMPTS) await new Promise((r) => setTimeout(r, ATTEMPT_DELAY_MS))
  }
}
console.error('::error::live web smoke check failed after all attempts')
process.exit(1)
