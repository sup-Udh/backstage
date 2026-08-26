/**
 * Generate the Backstage application icon.
 *
 *   node scripts/make-icons.mjs
 *
 * Writes build/icons/icon-<size>.png for every size an OS asks for, plus
 * build/icon.ico for Windows and build/icon.png (512) for Linux and for any
 * packager that wants a single source image.
 *
 * ---------------------------------------------------------------------------
 * Why generate it rather than commit a drawing
 * ---------------------------------------------------------------------------
 *
 * The icon is pixel art, and pixel art has exactly one correct way to be
 * resized: nearest-neighbour, by a whole number. Every size here is produced
 * from the same 16x16 master by integer upscaling, so 512 is the 16 with each
 * pixel drawn 32 times — identical shapes, no resampling, no soft edges, no
 * half-pixel seams. Hand-exporting seven PNGs from an image editor gets this
 * wrong the first time somebody picks bilinear.
 *
 * It also means the icon is designed at the size where it is hardest to read.
 * A 16x16 taskbar icon has 256 pixels to say "Backstage" with; anything that
 * survives that survives 512.
 *
 * Everything is written with Node's own zlib and Buffer — no image library, so
 * this runs on a clean checkout with nothing installed.
 */

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'build')
const ICONS = join(OUT, 'icons')

/* ------------------------------------------------------------- the art -- */

/**
 * The palette, taken from src/index.css so the icon cannot drift from the
 * product it represents.
 */
const PALETTE = {
  '#': [0x1b, 0x1b, 0x2a, 255], // ink — the outline everything in Backstage uses
  '.': [0xff, 0xc9, 0x4f, 255], // brand — the required #FFC94F ground
  h: [0x2e, 0x2e, 0x45, 255], // ink-2 — hair
  f: [0xf4, 0xcf, 0xa5, 255], // skin
  b: [0x2e, 0x2e, 0x45, 255], // the suit, same navy as the hair
  a: [0xff, 0xc9, 0x4f, 255], // brand — the tie, reading as a notch of light
  s: [0xc9, 0x7f, 0x1c, 255] //  brand-shadow — the hard drop shadow
}

/**
 * The master, 16x16.
 *
 * A character in head-and-shoulders, centred, on brand yellow inside a hard
 * ink border. Head-and-shoulders because it is the one composition that stays
 * legible when it is sixteen pixels tall — a full-body sprite at this size is
 * four pixels of person and eleven of floor.
 *
 * The suit and the hair are the same navy on purpose: at 16px they merge into
 * a single dark mass with a skin-coloured face punched out of it, which is the
 * silhouette. The tie is brand yellow rather than a third colour so it reads
 * as a gap in that mass rather than as detail to resolve.
 */
const ART = [
  '################',
  '#..............#',
  '#....hhhhhh....#',
  '#...hhhhhhhh...#',
  '#...hffffffh...#',
  '#...hffffffh...#',
  '#...hf#ff#fh...#',
  '#...hffffffh...#',
  '#....ffffff....#',
  '#.....ffff.....#',
  '#......ff......#',
  '#...bbbbbbbb...#',
  '#..bbbbbbbbbb..#',
  '#..bbbbaabbbb..#',
  '#..bbbbbbbbbb..#',
  '################'
]

const MASTER = ART.length

for (const [i, row] of ART.entries()) {
  if (row.length !== MASTER) {
    throw new Error(`Row ${i} is ${row.length} px wide; every row must be ${MASTER}.`)
  }
  for (const ch of row) {
    if (!PALETTE[ch]) throw new Error(`Row ${i} uses "${ch}", which has no colour.`)
  }
}

/* ------------------------------------------------------------ rendering -- */

/**
 * Render the master at `size`, nearest-neighbour.
 *
 * `size` need not be a whole multiple of 16 — 24 and 48 are not — so the
 * source pixel is chosen by flooring rather than by repeating a fixed block.
 * That keeps the shapes right at awkward sizes instead of cropping them.
 */
function render(size) {
  const rgba = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    const sy = Math.floor((y * MASTER) / size)
    for (let x = 0; x < size; x++) {
      const sx = Math.floor((x * MASTER) / size)
      const [r, g, b, a] = PALETTE[ART[sy][sx]]
      const o = (y * size + x) * 4
      rgba[o] = r
      rgba[o + 1] = g
      rgba[o + 2] = b
      rgba[o + 3] = a
    }
  }
  return rgba
}

/* ----------------------------------------------------------------- PNG -- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** A minimal 8-bit RGBA PNG. Filter 0 on every scanline: the art is flat. */
function png(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  ihdr[10] = 0 // deflate
  ihdr[11] = 0 // adaptive filtering
  ihdr[12] = 0 // no interlace

  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/* ----------------------------------------------------------------- ICO -- */

/**
 * A Windows .ico holding PNG-compressed entries.
 *
 * PNG inside ICO is supported from Windows Vista onward and is what every
 * modern toolchain emits; the alternative is a BMP with an upside-down bitmap
 * and a separate 1-bit AND mask, which is a lot of code to support an OS
 * Electron itself dropped years ago.
 *
 * 256 is stored as 0 in the directory entry — the field is one byte, so 256
 * does not fit and zero is defined to mean it.
 */
function ico(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // 1 = icon
  header.writeUInt16LE(entries.length, 4)

  const dir = Buffer.alloc(16 * entries.length)
  let offset = header.length + dir.length

  entries.forEach(({ size, data }, i) => {
    const at = i * 16
    dir[at] = size >= 256 ? 0 : size
    dir[at + 1] = size >= 256 ? 0 : size
    dir[at + 2] = 0 // palette size: none, it is truecolour
    dir[at + 3] = 0 // reserved
    dir.writeUInt16LE(1, at + 4) // colour planes
    dir.writeUInt16LE(32, at + 6) // bits per pixel
    dir.writeUInt32LE(data.length, at + 8)
    dir.writeUInt32LE(offset, at + 12)
    offset += data.length
  })

  return Buffer.concat([header, dir, ...entries.map((e) => e.data)])
}

/* ---------------------------------------------------------------- write -- */

/** Every size an OS or store is likely to ask for. */
const PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512]
/** What goes inside the .ico. 512 is not a legal ICO entry size. */
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

mkdirSync(ICONS, { recursive: true })

const rendered = new Map()
for (const size of new Set([...PNG_SIZES, ...ICO_SIZES])) {
  rendered.set(size, png(size, render(size)))
}

for (const size of PNG_SIZES) {
  writeFileSync(join(ICONS, `icon-${size}.png`), rendered.get(size))
}

// The single-file sources packagers look for by convention.
writeFileSync(join(OUT, 'icon.png'), rendered.get(512))
writeFileSync(
  join(OUT, 'icon.ico'),
  ico(ICO_SIZES.map((size) => ({ size, data: rendered.get(size) })))
)

console.log(`Wrote ${PNG_SIZES.length} PNGs to build/icons/`)
console.log('Wrote build/icon.png (512) and build/icon.ico')
