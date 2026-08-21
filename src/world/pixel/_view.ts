import { buildCharacterOps, SPRITE_H, SPRITE_W } from './characterSprite'
import { frameCount } from '../../characters/character.states'
import type { CharacterState, SpriteFacing } from '../../characters/character.types'
import { detectiveCharacters } from '../../themes/detective/characters'

function raster(ops: ReturnType<typeof buildCharacterOps>): string[] {
  const grid: string[][] = Array.from({ length: SPRITE_H }, () =>
    Array.from({ length: SPRITE_W }, () => '.')
  )
  const glyph: Record<string, string> = {
    ink: '#', ink2: '#', white: 'o', skin: '+', skinLit: '+', skinShade: ':', skinDeep: ';',
    hair: 'H', hairLit: 'H', hairShade: 'h', hairDeep: 'h', facialHair: 'h',
    outfit: 'B', outfitLit: 'B', outfitShade: 'b', outfitDeep: 'b',
    shirt: 'S', shirtLit: 'S', shirtShade: 's', accent: 'T', accentShade: 't',
    vest: 'V', vestShade: 'v', trousers: 'L', trousersShade: 'l', shoes: '_',
    acc: '*', accShade: '*', accLit: '*'
  }
  for (const [x, y, w, h, key] of ops) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const px = x + i, py = y + j
      if (px < 0 || px >= SPRITE_W || py < 0 || py >= SPRITE_H) continue
      grid[py][px] = key === 'none' ? '.' : (glyph[String(key)] ?? '?')
    }
  }
  return grid.map((r) => r.join(''))
}

const who = process.argv[2] ?? 'jane'
const state = (process.argv[3] ?? 'sitWorking') as CharacterState
const facing = (process.argv[4] ?? 'down') as SpriteFacing
const c = detectiveCharacters.find((x) => x.id === who)!
const n = frameCount(state)
const grids = Array.from({ length: n }, (_, f) => raster(buildCharacterOps(c.appearance, state, f, facing)))
console.log(`${c.name} — ${state} / ${facing} — ${n} frames`)
console.log(grids.map((_, f) => `f${f}`.padEnd(SPRITE_W + 2)).join(''))
for (let y = 0; y < SPRITE_H; y++) console.log(grids.map((g) => g[y] + '  ').join(''))
