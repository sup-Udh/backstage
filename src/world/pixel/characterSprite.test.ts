import { buildCharacterOps, SPRITE_H, SPRITE_W } from './characterSprite'
import type { CharacterDef, CharacterState, Facing } from '../../characters/character.types'
import { detectiveCharacters } from '../../themes/detective/characters'
import { officeCharacters } from '../../themes/office/characters'
import { friendsCharacters } from '../../themes/friends/characters'
import { sherlockCharacters } from '../../themes/sherlock/characters'
import { strangerCharacters } from '../../themes/stranger/characters'
import { labCharacters } from '../../themes/lab/characters'

/**
 * Checks for the character sprites.
 *
 * Two things are worth guarding here, and neither is visible in a screenshot
 * of one character.
 *
 * The first is that nobody draws outside their cell. Sprites are packed into a
 * sheet 4 frames wide and 32 rows tall, so a stray pixel is not clipped — it
 * lands in the neighbouring frame, and the symptom is a character showing a
 * slice of the pose above them at one point in their walk cycle. Hair is where
 * this happens: an afro or a topknot reaches well above the skull, and the
 * skull moves with the frame's bob.
 *
 * The second is that no two characters in a cast share a face. That was the
 * state this whole pass exists to correct — hair and clothing carried the
 * identity, so eight characters were one head in eight wigs, and at the size
 * they are now drawn that is the difference between a team and a crowd.
 *
 * Rendering is pure arithmetic over op rectangles, so both are checkable
 * without a canvas.
 */

let failures = 0

const STATES: CharacterState[] = [
  'idle',
  'walking',
  'working',
  'thinking',
  'talking',
  'waiting',
  'success',
  'error'
]
const FACINGS: Facing[] = ['down', 'up', 'left', 'right']

/** How many rows count as the head, for the "distinct faces" check. */
const HEAD_ROWS = 13

const CASTS: [string, CharacterDef[]][] = [
  ['detective', detectiveCharacters],
  ['office', officeCharacters],
  ['friends', friendsCharacters],
  ['sherlock', sherlockCharacters],
  ['stranger', strangerCharacters],
  ['lab', labCharacters]
]

interface Raster {
  rows: string[]
  /** Pixels that fell outside the sprite cell. */
  outside: number
}

/**
 * Rasterise ops into a grid of palette keys.
 *
 * Later ops paint over earlier ones, exactly as the canvas does, and `none` is
 * the erase used to trim a shoulder in profile.
 */
function raster(ops: ReturnType<typeof buildCharacterOps>): Raster {
  const grid: string[][] = Array.from({ length: SPRITE_H }, () =>
    Array.from({ length: SPRITE_W }, () => ' ')
  )
  let outside = 0

  for (const [x, y, w, h, key] of ops) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const px = x + i
        const py = y + j
        if (px < 0 || px >= SPRITE_W || py < 0 || py >= SPRITE_H) {
          outside++
          continue
        }
        grid[py][px] = key === 'none' ? ' ' : String(key)[0]
      }
    }
  }

  return { rows: grid.map((r) => r.join('')), outside }
}

console.log('Character sprites')

for (const [theme, cast] of CASTS) {
  let escaped = 0

  for (const c of cast) {
    for (const state of STATES) {
      for (const facing of FACINGS) {
        for (let frame = 0; frame < 4; frame++) {
          const spriteFacing =
            facing === 'down' ? 'down' : facing === 'up' ? 'up' : 'side'
          const { outside } = raster(
            buildCharacterOps(c.appearance, state, frame, spriteFacing)
          )
          if (outside > 0) {
            escaped++
            if (escaped <= 3) {
              console.log(
                `  FAIL  ${theme}/${c.id} ${state}/${facing}/${frame}: ${outside}px outside the sprite cell`
              )
            }
          }
        }
      }
    }
  }

  if (escaped === 0) {
    console.log(`  ok    ${theme}: every pose stays inside its cell`)
  } else {
    failures++
    console.log(`  FAIL  ${theme}: ${escaped} poses draw outside their cell`)
  }

  /* ------------------------------------------------- distinct faces -- */

  const heads = new Map<string, string[]>()
  for (const c of cast) {
    const key = raster(buildCharacterOps(c.appearance, 'idle', 0, 'down'))
      .rows.slice(0, HEAD_ROWS)
      .join('\n')
    heads.set(key, [...(heads.get(key) ?? []), c.id])
  }

  const shared = [...heads.values()].filter((ids) => ids.length > 1)
  if (shared.length === 0) {
    console.log(`  ok    ${theme}: ${cast.length} characters, ${cast.length} distinct heads`)
  } else {
    failures++
    for (const ids of shared) {
      console.log(`  FAIL  ${theme}: identical heads — ${ids.join(', ')}`)
    }
  }

  /*
   * Silhouettes too, not just faces. Two characters can have different eyes
   * and still be indistinguishable across a room, which is where a name is
   * least readable and the outline is doing all the work.
   */
  const shapes = new Map<string, string[]>()
  for (const c of cast) {
    const key = raster(buildCharacterOps(c.appearance, 'idle', 0, 'down'))
      .rows.map((r) => r.replace(/[^ ]/g, '#'))
      .join('\n')
    shapes.set(key, [...(shapes.get(key) ?? []), c.id])
  }

  const sameShape = [...shapes.values()].filter((ids) => ids.length > 1)
  if (sameShape.length === 0) {
    console.log(`  ok    ${theme}: every silhouette is different`)
  } else {
    failures++
    for (const ids of sameShape) {
      console.log(`  FAIL  ${theme}: identical silhouettes — ${ids.join(', ')}`)
    }
  }
}

/* ------------------------------------------------------------------ art -- */

/**
 * `node characterSprite.test.js --show detective` prints the heads as ASCII,
 * side by side. The checks above say whether two faces are the same; this is
 * for looking at whether a face is any good.
 */
const showIndex = process.argv.indexOf('--show')
if (showIndex !== -1) {
  const wanted = process.argv[showIndex + 1] ?? 'detective'
  const cast = CASTS.find(([n]) => n === wanted)?.[1] ?? detectiveCharacters

  for (let start = 0; start < cast.length; start += 4) {
    const group = cast.slice(start, start + 4)
    console.log('\n' + group.map((c) => c.name.padEnd(SPRITE_W + 3)).join(''))
    const grids = group.map((c) =>
      raster(buildCharacterOps(c.appearance, 'idle', 0, 'down')).rows
    )
    for (let y = 0; y < HEAD_ROWS; y++) {
      console.log(grids.map((g) => g[y] + '   ').join(''))
    }
  }
}

if (failures > 0) {
  console.log(`\n${failures} sprite check(s) failed.`)
  process.exit(1)
}
console.log('\nAll sprite checks passed.')
