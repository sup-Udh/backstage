import type { CharacterAppearance, CharacterState, Facing } from '../../characters/character.types'
import { ANIMATIONS } from '../../characters/character.states'
import { createPixelCanvas, paint, type Op, type Palette } from '../pixel/ops'
import {
  appearancePalette,
  buildCharacterOps,
  isMirrored,
  SPRITE_H,
  SPRITE_W,
  spriteFacing
} from '../pixel/characterSprite'

/**
 * Every animation frame for one character, baked once into a single sheet.
 *
 * Building sprites is pure arithmetic, but doing it 60 times a second for
 * four characters would be wasteful, so each character is rasterised once at
 * startup and the render loop only ever blits.
 */

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

const MAX_FRAMES = 4

export interface CharacterSheet {
  /** Full-colour frames. */
  sheet: HTMLCanvasElement
  /** Same frames as a flat silhouette, used to draw the hover outline. */
  silhouette: HTMLCanvasElement
}

function rowIndex(state: CharacterState, facing: Facing): number {
  return STATES.indexOf(state) * FACINGS.length + FACINGS.indexOf(facing)
}

const ROWS = STATES.length * FACINGS.length

export function buildCharacterSheet(
  appearance: CharacterAppearance,
  outlineColour: string
): CharacterSheet {
  const palette: Palette = appearancePalette(appearance)
  const { canvas: sheet, ctx } = createPixelCanvas(
    SPRITE_W * MAX_FRAMES,
    SPRITE_H * ROWS
  )
  // Scratch buffer used to flip left-facing frames.
  const scratch = createPixelCanvas(SPRITE_W, SPRITE_H)

  for (const state of STATES) {
    const clip = ANIMATIONS[state]
    for (const facing of FACINGS) {
      const row = rowIndex(state, facing)
      const mirror = isMirrored(facing)
      for (let f = 0; f < MAX_FRAMES; f++) {
        // Short clips repeat, so every column of the sheet is valid.
        const frame = f % clip.frames
        const ops: Op[] = buildCharacterOps(
          appearance,
          state,
          frame,
          spriteFacing(facing)
        )
        const dx = f * SPRITE_W
        const dy = row * SPRITE_H

        if (!mirror) {
          ctx.save()
          ctx.translate(dx, dy)
          paint(ctx, ops, palette)
          ctx.restore()
        } else {
          scratch.ctx.clearRect(0, 0, SPRITE_W, SPRITE_H)
          paint(scratch.ctx, ops, palette)
          ctx.save()
          ctx.translate(dx + SPRITE_W, dy)
          ctx.scale(-1, 1)
          ctx.drawImage(scratch.canvas, 0, 0)
          ctx.restore()
        }
      }
    }
  }

  // Flatten to a single colour for the hover outline.
  const { canvas: silhouette, ctx: sctx } = createPixelCanvas(
    sheet.width,
    sheet.height
  )
  sctx.drawImage(sheet, 0, 0)
  sctx.globalCompositeOperation = 'source-in'
  sctx.fillStyle = outlineColour
  sctx.fillRect(0, 0, sheet.width, sheet.height)

  return { sheet, silhouette }
}

/** Source rectangle for one frame within a sheet. */
export function frameRect(
  state: CharacterState,
  facing: Facing,
  frame: number
): { sx: number; sy: number } {
  return {
    sx: (frame % MAX_FRAMES) * SPRITE_W,
    sy: rowIndex(state, facing) * SPRITE_H
  }
}

/* ---------------------------------------------------------- prop baking -- */

export interface BakedProp {
  canvas: HTMLCanvasElement
  x: number
  y: number
  baseY: number
}

/**
 * Rasterise a prop once into a tightly cropped canvas. Static furniture then
 * costs a single drawImage per frame instead of dozens of fillRects.
 */
export function bakeOps(
  ops: readonly Op[],
  palette: Palette,
  baseY: number
): BakedProp | null {
  if (ops.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y, w, h] of ops) {
    if (w <= 0 || h <= 0) continue
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x + w > maxX) maxX = x + w
    if (y + h > maxY) maxY = y + h
  }
  if (!isFinite(minX)) return null

  const { canvas, ctx } = createPixelCanvas(maxX - minX, maxY - minY)
  paint(ctx, ops, palette, -minX, -minY)
  return { canvas, x: minX, y: minY, baseY }
}
