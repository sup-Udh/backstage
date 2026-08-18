import { _electron as electron } from 'playwright'
const app = await electron.launch({ args: ['.'], cwd: 'C:/code/backstage/e-app' })
const win = await app.firstWindow()
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(2200)
const r = await win.evaluate(async () => {
  await document.fonts.ready
  const c = document.createElement('canvas').getContext('2d')
  // If a char is missing from a font, the browser falls back, so its width
  // matches the width measured with a font that does not exist at all.
  const w = (ch, font) => { c.font = `40px ${font}`; return c.measureText(ch).width }
  const test = (ch) => {
    const geist = w(ch, '"Geist Pixel"')
    const none = w(ch, '"__nope__"')
    const mono = w(ch, '"JetBrains Mono"')
    return { ch, geist, none, mono,
             geistCovers: Math.abs(geist - none) > 0.01,
             monoCovers: Math.abs(mono - none) > 0.01 }
  }
  return ['A', '\u25CF', '\u25CB', '\u25D0', '\u25D1', '\u25C6', '\u25C7', '\u2014', '\u2192'].map(test)
})
for (const t of r) {
  console.log(
    `U+${t.ch.codePointAt(0).toString(16).toUpperCase().padStart(4,'0')} ${JSON.stringify(t.ch)}` +
    `  geist=${t.geistCovers ? 'YES' : 'no '}  jetbrains=${t.monoCovers ? 'YES' : 'no '}`)
}
await app.close()
