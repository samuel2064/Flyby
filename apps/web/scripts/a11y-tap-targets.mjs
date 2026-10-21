#!/usr/bin/env node
/**
 * A11y device-emulation check (TIR-340 / TIR-308 / TIR-348).
 *
 * Runs a real browser at the QA mobile viewport (390x844, dsf=3) against the
 * LIVE deployed site and measures:
 *  - the two compact header actions on the Search & Report view:
 *      "Refresh" and "Report a wait time"  -> must render >= 44x44 CSS px
 *      (WCAG 2.5.5 tap-target guidance)
 *  - the footer text contrast ratio      -> must be >= 4.5:1 (WCAG 1.4.3;
 *      slate-500 on the slate-50 page background is ~4.76:1)
 *
 * Other interactive elements are measured and REPORTED but do not fail the
 * run (40px minimum with spacing is tolerated for them, matching the QA
 * verdict on the 4-hour history / Install / Not-now buttons).
 *
 * Usage:
 *   node scripts/a11y-tap-targets.mjs [baseURL]
 *   LIVE_WEB_URL=https://flyby-web.onrender.com node scripts/a11y-tap-targets.mjs
 *
 * Exit code 0 only when every hard requirement passes. Cold starts and
 * in-flight deploys are tolerated with 3 attempts (45s apart), matching
 * live-web-smoke.mjs cushioning.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.argv[2] || process.env.LIVE_WEB_URL || 'https://flyby-web.onrender.com'
const ATTEMPTS = 3
const ATTEMPT_DELAY_MS = 45_000
const VIEWPORT = { width: 390, height: 844 }
const DSF = 3
const SHOT_DIR = join(process.cwd(), 'test-output', 'a11y')

const fail = (msg) => {
  console.error(`::error::${msg}`)
  throw new Error(msg)
}

// --- WCAG contrast math (mirrors src/lib/contrast.ts; this script runs under
// --- plain node without a TS loader, so the 12 lines are mirrored here).
const hexToRgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) throw new Error(`Invalid hex color: ${hex}`)
  const int = parseInt(m[1], 16)
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
}
const chan = (c8) => {
  const c = c8 / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
const luminance = ([r, g, b]) => 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b)
const contrastRatio = (a, b) => {
  const la = luminance(hexToRgb(a))
  const lb = luminance(hexToRgb(b))
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

const rgbStrToHex = (rgb) => {
  const m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(rgb)
  if (!m) throw new Error(`Unsupported color string: ${rgb}`)
  return '#' + m.slice(1).map((v) => Number(v).toString(16).padStart(2, '0')).join('')
}

async function attempt(n) {
  const browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: VIEWPORT,
    deviceScaleFactor: DSF,
    isMobile: true,
    hasTouch: true,
  })

  try {
    console.log(`[attempt ${n}] loading ${BASE} at ${VIEWPORT.width}x${VIEWPORT.height} dsf=${DSF} ...`)
    // domcontentloaded, not networkidle: the app holds a long-lived SSE
    // connection, so the network never goes idle. Selector waits below do
    // the real gating.
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    await page.waitForSelector('button:has-text("Search & Report")', { timeout: 60_000 })

    // The compact actions live on the Search & Report view (QA measurement
    // surface for TIR-340).
    await page.click('button:has-text("Search & Report")')

    // "Refresh" only renders once a wait-time load has completed (i.e. the
    // API responded). Generous timeout absorbs Render cold starts.
    await page.waitForSelector('button:has-text("Refresh")', { timeout: 120_000 })
    await page.waitForSelector('[data-testid="report-button"]', { timeout: 30_000 })

    const boxes = {}
    for (const [name, sel] of [
      ['Refresh', 'button:has-text("Refresh")'],
      ['Report a wait time', '[data-testid="report-button"]'],
    ]) {
      const el = page.locator(sel).first()
      const box = await el.boundingBox()
      if (!box) fail(`${name}: no bounding box (not rendered?)`)
      boxes[name] = box
      console.log(`  ${name}: ${box.width.toFixed(1)} x ${box.height.toFixed(1)} CSS px`)
    }

    // Report-only sweep: every other visible button on this view.
    const others = await page.evaluate(() => {
      const named = new Set(['Refresh', 'Report a wait time'])
      return [...document.querySelectorAll('button')]
        .filter((b) => {
          const t = (b.textContent || '').trim()
          return t && !named.has(t) && b.offsetParent !== null
        })
        .map((b) => {
          const r = b.getBoundingClientRect()
          return { text: (b.textContent || '').trim().slice(0, 40), w: r.width, h: r.height }
        })
    })
    for (const o of others) {
      console.log(`  [report-only] ${JSON.stringify(o.text)}: ${o.w.toFixed(1)} x ${o.h.toFixed(1)}`)
      if (o.h < 40) {
        console.log(`    NOTE: under the 40px tolerated minimum - file a follow-up if this is a primary action`)
      }
    }

    // Footer contrast: computed color of the footer line vs the nearest
    // ancestor that actually paints a background (the slate-50 page shell).
    const footer = page.locator('p', { hasText: 'crowdsourced airport security wait times' }).last()
    const { color, bg, text } = await footer.evaluate((el) => {
      const cs = getComputedStyle(el)
      let node = el
      let bg = 'rgba(0, 0, 0, 0)'
      while (node && node !== document.documentElement) {
        const b = getComputedStyle(node).backgroundColor
        if (b && !/rgba?\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(b) && !/transparent/i.test(b)) {
          bg = b
          break
        }
        node = node.parentElement
      }
      return { color: cs.color, bg, text: (el.textContent || '').trim() }
    })
    const ratio = contrastRatio(rgbStrToHex(color), rgbStrToHex(bg))
    console.log(`  footer "${text.slice(0, 48)}": color=${color} on bg=${bg} -> contrast ${ratio.toFixed(2)}:1`)

    // Hard requirements (TIR-348 "done means"):
    for (const name of ['Refresh', 'Report a wait time']) {
      const { width, height } = boxes[name]
      if (width < 44 || height < 44) {
        fail(`${name} tap target is ${width.toFixed(1)}x${height.toFixed(1)} - below the 44x44 CSS px requirement`)
      }
    }
    if (ratio < 4.5) {
      fail(`footer contrast ${ratio.toFixed(2)}:1 is below the 4.5:1 WCAG AA requirement (expected ~4.76:1 with slate-500)`)
    }

    mkdirSync(SHOT_DIR, { recursive: true })
    await page.screenshot({ path: join(SHOT_DIR, `a11y-search-report-${n}.png`), fullPage: true })
    console.log(`  screenshot: ${join(SHOT_DIR, `a11y-search-report-${n}.png`)}`)

    console.log(`[attempt ${n}] all a11y checks passed`)
    return { boxes, ratio }
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
console.error('::error::a11y check failed after all attempts')
process.exit(1)
