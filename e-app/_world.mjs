import { _electron as electron } from 'playwright'
const OUT = process.argv[2]
const app = await electron.launch({ args: ['.'], cwd: 'C:/code/backstage/e-app' })
const win = await app.firstWindow()
const errs = []
win.on('pageerror', (e) => errs.push(String(e)))
win.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()) })
await win.waitForLoadState('domcontentloaded')
await win.setViewportSize({ width: 1440, height: 900 })
await win.evaluate(() => localStorage.removeItem('backstage.theme'))
await win.reload()
await win.evaluate(() => document.fonts.ready)
await win.waitForTimeout(3200)
await win.evaluate(() => window.scrollTo(0, 0))
await win.waitForTimeout(500)
const c = win.locator('canvas').first()
await c.screenshot({ path: `${OUT}/world.png` })
await win.screenshot({ path: `${OUT}/landing.png` })

// Zoomed detail: enter the app and zoom in on the office.
await win.getByRole('button', { name: /get started/i }).first().click()
await win.waitForTimeout(1000)
console.log('errors:', errs.length ? errs.slice(0,3) : 'none')
await app.close()
