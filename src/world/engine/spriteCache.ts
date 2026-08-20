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

/**
 * How large a character stands in the world, relative to its source art.
 *
 * The office is the setting and the agents are people working in it, so the
 * cast has to read as inhabitants rather than as the subject of the picture.
 * At full size a character was taller than the desk it sat at and wider than
 * the monitor on it, which reversed that.
 *
 * Expressed as a ratio rather than a pixel size on purpose. Characters are
 * drawn in scene pixels and the camera scales the whole scene by a whole
 * number, so this one figure holds the same character-to-furniture proportion
 * at every zoom level and every window size — there is no size that is only
 * correct at one viewport.
 *
 * 0.6 rather than an arbitrary fraction because 20x30 x 0.6 is exactly 12x18:
 * both axes land on whole pixels and the 2:3 proportion is preserved exactly,
 * so nothing is stretched and no pixel is ever sampled between two others.
 */
export const CHARACTER_SCALE = 0.6

/** The character's footprint in the world, in scene pixels. */
export const WORLD_SPRITE_W = Math.round(SPRITE_W * CHARACTER_SCALE)
export const WORLD_SPRITE_H = Math.round(SPRITE_H * CHARACTER_SCALE)

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

/* ------------------------------------------------------- world-scale art -- */

/**
 * The same sheet at the size characters actually stand in the office.
 *
 * Resampled once at startup rather than scaled on every blit: the render loop
 * keeps doing plain 1:1 draws, and the resampling decision is made in exactly
 * one place instead of being repeated per frame with whatever the context's
 * smoothing flag happened to be.
 *
 * The art itself is untouched — same ops, same palette, same proportions. Only
 * how many screen pixels it occupies changes. `createPixelCanvas` leaves image
 * smoothing off, so this is a nearest-neighbour resample: edges stay hard and
 * nothing is blended, which is the only kind of scaling pixel art survives.
 *
 * The whole sheet is resampled in one draw, which is what keeps the frame grid
 * intact: both the sheet width and its height are exact multiples of the cell
 * size, so every cell boundary still lands on a whole pixel afterwards.
 */
function shrink(source: HTMLCanvasElement): HTMLCanvasElement {
  const { canvas, ctx } = createPixelCanvas(
    Math.round(source.width * CHARACTER_SCALE),
    Math.round(source.height * CHARACTER_SCALE)
  )
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}

/**
 * A character sheet at world scale.
 *
 * Deliberately separate from `buildCharacterSheet`, which stays at full size:
 * the team cards and the inspector show a character as a portrait, and those
 * want the original art. Only the office shrinks.
 */
export function buildWorldSheet(
  appearance: CharacterAppearance,
  outlineColour: string
): CharacterSheet {
  const full = buildCharacterSheet(appearance, outlineColour)
  return { sheet: shrink(full.sheet), silhouette: shrink(full.silhouette) }
}

/** Source rectangle for one frame within a world-scale sheet. */
export function worldFrameRect(
  state: CharacterState,
  facing: Facing,
  frame: number
): { sx: number; sy: number } {
  return {
    sx: (frame % MAX_FRAMES) * WORLD_SPRITE_W,
    sy: rowIndex(state, facing) * WORLD_SPRITE_H
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
