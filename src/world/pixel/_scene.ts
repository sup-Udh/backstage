/**
 * Scratch: rasterise a whole scene to a PNG, with no canvas and no browser.
 *
 * Everything in this world is `Op` rectangles over a palette, so a scene can
 * be composed in plain arithmetic — which is the only way to actually look at
 * the office without launching Electron.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import type { Op, Palette } from './ops'
import { buildCharacterOps, appearancePalette } from './characterSprite'
import type { CharacterState } from '../../characters/character.types'
import { getTheme } from '../../themes'
import { officeLayout, officeGrid } from '../../themes/shared/office'

const W = Number(process.argv[3] ?? 760)
const H = Number(process.argv[4] ?? 420)
const themeId = process.argv[2] ?? 'detective'
const out = process.argv[5] ?? 'scene.png'

const theme = getTheme(themeId)
const scene = theme.buildScene(W, H)
const pal = theme.palette

const px = new Uint8Array(scene.width * scene.height * 4)

function put(ops: readonly Op[], palette: Palette, dx = 0, dy = 0): void {
  for (const [x, y, w, h, key] of ops) {
    const colour = key in palette ? palette[key] : key
    if (!colour || colour === 'none') continue
    const n = parseInt(colour.slice(1), 16)
    const r = (n >> 16) & 255
    const g = (n >> 8) & 255
    const b = n & 255
    for (let j = 0; j < h; j++) {
      const yy = y + j + dy
      if (yy < 0 || yy >= scene.height) continue
      for (let i = 0; i < w; i++) {
        const xx = x + i + dx
        if (xx < 0 || xx >= scene.width) continue
        const o = (yy * scene.width + xx) * 4
        px[o] = r
        px[o + 1] = g
        px[o + 2] = b
        px[o + 3] = 255
      }
    }
  }
}

put(scene.background, pal)

/* Characters, one per workstation, cycling through the seated poses. */
const cast = theme.characters
const POSES: CharacterState[] = [
  'sitWorking',
  'sitThinking',
  'sitReading',
  'sitting',
  'sitWaiting',
  'sitTalking',
  'sitWorking'
]

interface Item {
  baseY: number
  draw: () => void
}
const items: Item[] = []
for (const p of scene.props) items.push({ baseY: p.baseY, draw: () => put(p.ops, pal) })

scene.workstations.forEach((ws, i) => {
  const c = cast[i % cast.length]
  const state = POSES[i % POSES.length]
  const frame = i % 4
  const ops = buildCharacterOps(c.appearance, state, frame, 'down')
  const cpal = appearancePalette(c.appearance)
  items.push({
    baseY: ws.seat.y,
    draw: () => put(ops, cpal, ws.seat.x - 10, ws.seat.y - 30)
  })
})

// One walking across the lane, and one standing at the board, to check both.
{
  const c = cast[3 % cast.length]
  const ops = buildCharacterOps(c.appearance, 'walking', 2, 'side')
  items.push({
    baseY: scene.laneY,
    draw: () => put(ops, appearancePalette(c.appearance), 140, scene.laneY - 30)
  })
}
if (scene.boardSpots[0]) {
  const b = scene.boardSpots[0]
  const c = cast[5 % cast.length]
  const ops = buildCharacterOps(c.appearance, 'thinking', 3, 'up')
  items.push({
    baseY: b.y,
    draw: () => put(ops, appearancePalette(c.appearance), b.x - 10, b.y - 30)
  })
}
if (scene.talkSpots[0]) {
  const [a, b] = scene.talkSpots[0]
  const ca = cast[6 % cast.length]
  const cb = cast[7 % cast.length]
  items.push({
    baseY: a.y,
    draw: () => {
      put(
        buildCharacterOps(ca.appearance, 'talking', 2, 'side'),
        appearancePalette(ca.appearance),
        a.x - 10,
        a.y - 30
      )
      put(
        buildCharacterOps(cb.appearance, 'waiting', 0, 'side'),
        appearancePalette(cb.appearance),
        b.x - 10,
        b.y - 30
      )
    }
  })
}

items.sort((p, q) => p.baseY - q.baseY)
for (const it of items) it.draw()

/* ------------------------------------------------------------------ png -- */

function crc32(buf: Buffer): number {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

// Upscale so the pixels are legible in an image viewer.
const S = Number(process.env.SCALE ?? 2)
const OW = scene.width * S
const OH = scene.height * S
const raw = Buffer.alloc(OH * (OW * 4 + 1))
for (let y = 0; y < OH; y++) {
  const rowStart = y * (OW * 4 + 1)
  raw[rowStart] = 0
  for (let x = 0; x < OW; x++) {
    const o = (Math.floor(y / S) * scene.width + Math.floor(x / S)) * 4
    const d = rowStart + 1 + x * 4
    raw[d] = px[o]
    raw[d + 1] = px[o + 1]
    raw[d + 2] = px[o + 2]
    raw[d + 3] = px[o + 3] || 255
  }
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(OW, 0)
ihdr.writeUInt32BE(OH, 4)
ihdr[8] = 8
ihdr[9] = 6
writeFileSync(
  out,
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
)
console.log(`${out}  ${OW}x${OH}  (scene ${scene.width}x${scene.height}, ${scene.workstations.length} workstations)`)
void officeLayout
void officeGrid
