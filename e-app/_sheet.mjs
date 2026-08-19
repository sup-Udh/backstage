import { _electron as electron } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
const OUT = process.argv[2]
const code = readFileSync(`${OUT}/sprite.js`, 'utf8')

const app = await electron.launch({ args: ['.'], cwd: 'C:/code/backstage/e-app' })
const win = await app.firstWindow()
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(2000)

const png = await win.evaluate((src) => {
  // eslint-disable-next-line no-eval
  ;(0, eval)(src)
  const S = window.SPRITE
  const cast = S.detectiveCharacters
  const Z = 6, W = S.SPRITE_W, H = S.SPRITE_H
  const states = ['idle', 'working', 'thinking', 'talking', 'walking']
  const rows = states.length + 1
  const cv = document.createElement('canvas')
  cv.width = cast.length * W * Z
  cv.height = rows * H * Z + 34
  const ctx = cv.getContext('2d')
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#FFF6E4'
  ctx.fillRect(0, 0, cv.width, cv.height)

  const draw = (a, state, frame, dx, dy, sil) => {
    const off = document.createElement('canvas')
    off.width = W; off.height = H
    const o = off.getContext('2d')
    o.imageSmoothingEnabled = false
    S.paint(o, S.buildCharacterOps(a, state, frame, 'down'), S.appearancePalette(a))
    if (sil) {
      o.globalCompositeOperation = 'source-in'
      o.fillStyle = '#1B1B2A'
      o.fillRect(0, 0, W, H)
    }
    ctx.drawImage(off, 0, 0, W, H, dx, dy, W * Z, H * Z)
  }

  states.forEach((st, r) =>
    cast.forEach((c, i) => draw(c.appearance, st, r % 2, i * W * Z, r * H * Z, false)))
  cast.forEach((c, i) =>
    draw(c.appearance, 'idle', 0, i * W * Z, states.length * H * Z, true))

  ctx.fillStyle = '#1B1B2A'
  ctx.font = 'bold 15px monospace'
  cast.forEach((c, i) => ctx.fillText(c.name, i * W * Z + 5, rows * H * Z + 22))
  return cv.toDataURL('image/png')
}, code)

writeFileSync(`${OUT}/sheet.png`, Buffer.from(png.split(',')[1], 'base64'))
console.log('sheet written')
await app.close()
