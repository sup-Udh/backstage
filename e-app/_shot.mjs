import { _electron as electron } from 'playwright'
const OUT = process.argv[2]
const app = await electron.launch({ args: ['.'], cwd: 'C:/code/backstage/e-app' })
const win = await app.firstWindow()
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(2600)
await win.setViewportSize({ width: 1440, height: 900 })
await win.waitForTimeout(900)

const check = await win.evaluate(async () => {
  await document.fonts.ready
  const read = (label, sel) => {
    const el = document.querySelector(sel)
    if (!el) return `${label}: MISSING`
    const cs = getComputedStyle(el)
    return `${label}: ${cs.fontFamily.split(',')[0].replace(/"/g,'')} @ ${cs.fontWeight}`
  }
  return [
    read('hero h1        ', 'h1'),
    read('hero prose     ', '#top p.max-w-md'),
    read('wordmark       ', 'header a span:last-child'),
    read('nav link       ', 'header nav a'),
    read('section h2     ', '#team h2'),
    read('char name      ', '#team h3'),
    read('char role      ', '#team article p'),
    read('CTA button     ', '#top button'),
    'pixelify still loaded? ' + [...document.fonts].some(f => f.family.includes('Pixelify')),
    'families: ' + [...new Set([...document.fonts].map(f => f.family))].join(', ')
  ]
})
console.log(check.join('\n'))
await win.screenshot({ path: `${OUT}/t-hero.png` })
await win.evaluate(() => document.querySelector('#team')?.scrollIntoView())
await win.waitForTimeout(700)
await win.screenshot({ path: `${OUT}/t-team.png` })
console.log('errors:', errors.length ? errors : 'none')
await app.close()
