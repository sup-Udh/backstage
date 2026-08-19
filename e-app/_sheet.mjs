import { _electron as electron } from 'playwright'
const OUT = process.argv[2]
const app = await electron.launch({ args: ['.'], cwd: 'C:/code/backstage/e-app' })
const win = await app.firstWindow()
await win.waitForLoadState('domcontentloaded')
await win.waitForTimeout(2500)

// Render every detective character at large scale, plus a silhouette row.
const png = await win.evaluate(async () => {
  const mod = await import('/src/themes/detective/characters/index.ts')
  const sprite = await import('/src/world/pixel/characterSprite.ts')
  const ops = await import('/src/world/pixel/ops.ts')
  const cast = mod.detectiveCharacters
  const S = 6, W = sprite.SPRITE_W, H = sprite.SPRITE_H
  const states = ['idle', 'working', 'thinking', 'talking']
  const cols = cast.length
  const rows = states.length + 1
  const cv = document.createElement('canvas')
  cv.width = cols * W * S
  cv.height = rows * H * S + 40
  const ctx = cv.getContext('2d')
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#FFF6E4'
  ctx.fillRect(0, 0, cv.width, cv.height)

  const draw = (a, state, frame, dx, dy, silhouette) => {
    const off = document.createElement('canvas')
    off.width = W; off.height = H
    const o = off.getContext('2d')
    o.imageSmoothingEnabled = false
    const pal = sprite.appearancePalette(a)
    ops.paint(o, sprite.buildCharacterOps(a, state, frame, 'down'), pal)
    if (silhouette) {
      o.globalCompositeOperation = 'source-in'
      o.fillStyle = '#1B1B2A'
      o.fillRect(0, 0, W, H)
    }
    ctx.drawImage(off, 0, 0, W, H, dx, dy, W * S, H * S)
  }

  states.forEach((st, r) => {
    cast.forEach((c, i) => draw(c.appearance, st, r % 2, i * W * S, r * H * S, false))
  })
  cast.forEach((c, i) => draw(c.appearance, 'idle', 0, i * W * S, states.length * H * S, true))

  ctx.fillStyle = '#1B1B2A'
  ctx.font = '16px monospace'
  cast.forEach((c, i) => ctx.fillText(c.name, i * W * S + 6, rows * H * S + 24))
  return cv.toDataURL('image/png')
})
const fs = await import('node:fs')
fs.writeFileSync(`${OUT}/sheet.png`, Buffer.from(png.split(',')[1], 'base64'))
console.log('sheet written')
await app.close()
