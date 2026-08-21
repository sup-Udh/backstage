import type { CharacterAppearance, CharacterState, Facing } from '../../characters/character.types'
import { frameCount, MAX_CLIP_FRAMES } from '../../characters/character.states'
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

/**
 * The sheet's rows, in order.
 *
 * Fifteen poses rather than eight, because half of them are what a character
 * looks like *in a chair*. That split is the reason an agent's model call no
 * longer sends its body walking across the office: thinking at a desk and
 * thinking at a board are two drawings, not one drawing and a relocation.
 */
const STATES: CharacterState[] = [
  'idle',
  'walking',
  'working',
  'thinking',
  'talking',
  'waiting',
  'success',
  'error',
  'sitting',
  'sitWorking',
  'sitReading',
  'sitThinking',
  'sitTalking',
  'sitWaiting',
  'sitError'
]

const FACINGS: Facing[] = ['down', 'up', 'left', 'right']

/**
 * Columns in the sheet.
 *
 * Derived from the longest clip rather than fixed at four. It *was* fixed at
 * four, and that cap is most of why "working" looked like standing: a state
 * could not be given a sixth frame because there was nowhere on the sheet to
 * put it, so every pose was authored as two frames of one-pixel hand movement
 * and the difference between working, waiting and idling came down to the word
 * printed underneath.
 */
const MAX_FRAMES = MAX_CLIP_FRAMES

/**
 * How large a character stands in the world, relative to its source art.
 *
 * One. Not 0.6, which is what it was, and which was not a size change — it was
 * a nearest-neighbour resample that deleted two of every five rows and columns
 * of a twenty-by-thirty sprite. A brow on this skeleton is one pixel tall, an
 * eye is two by two, a nose is one; a reduction at that ratio does not shrink
 * those features, it removes whichever of them the arithmetic lands on. Every
 * character in every theme had a deliberately specified face and none of them
 * survived to the screen, which is exactly the "faces are too generic" the
 * whole cast was accused of.
 *
 * The environment is made dominant by being large and dense — a wider room,
 * more workstations, more furniture per square foot of floor — rather than by
 * making the people in it unreadable. That is the trade the constant used to
 * get wrong: it bought proportion with identity, and identity is the thing the
 * product is about.
 *
 * Kept as a named constant, at 1, so that the decision is visible rather than
 * absent — and so nothing re-derives a fractional scale by accident.
 */
export const CHARACTER_SCALE = 1

/** The character's footprint in the world, in scene pixels. */
export const WORLD_SPRITE_W = SPRITE_W
export const WORLD_SPRITE_H = SPRITE_H

export interface CharacterSheet {
  /** Full-colour frames, one row per state/facing pair. */
  sheet: HTMLCanvasElement
}

function rowIndex(state: CharacterState, facing: Facing): number {
  const s = STATES.indexOf(state)
  // An unknown state would otherwise index row -4..-1 and draw the bottom of
  // the sheet, which reads as a character abruptly changing pose for no
  // reason. Falling back to idle is wrong quietly rather than wrong loudly.
  return (s < 0 ? 0 : s) * FACINGS.length + FACINGS.indexOf(facing)
}

const ROWS = STATES.length * FACINGS.length

export function buildCharacterSheet(appearance: CharacterAppearance): CharacterSheet {
  const palette: Palette = appearancePalette(appearance)
  const { canvas: sheet, ctx } = createPixelCanvas(
    SPRITE_W * MAX_FRAMES,
    SPRITE_H * ROWS
  )
  // Scratch buffer used to flip left-facing frames.
  const scratch = createPixelCanvas(SPRITE_W, SPRITE_H)

  for (const state of STATES) {
    const frames = frameCount(state)
    for (const facing of FACINGS) {
      const row = rowIndex(state, facing)
      const mirror = isMirrored(facing)
      for (let f = 0; f < MAX_FRAMES; f++) {
        // Short clips repeat, so every column of the sheet is valid.
        const frame = f % frames
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

  return { sheet }
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
 * Sheets already baked this session, keyed by the appearance they came from.
 *
 * A WeakMap rather than a string key: a cast's appearances are module
 * constants in the theme files, so their identity is stable for the life of
 * the app and no key has to be derived from — or kept in step with — their
 * contents.
 *
 * This exists because the renderer is rebuilt every time the room is re-laid
 * out, which happens whenever the panel changes shape. A sheet is now sixty
 * rows of eight frames rather than thirty-two rows of four, so re-baking the
 * whole cast is roughly four hundred thousand rectangle fills — perfectly
 * affordable once, and a visible stall in the middle of dragging a window
 * edge. Nothing about a sheet depends on the room, so nothing about the room
 * should cost one.
 */
const sheets = new WeakMap<CharacterAppearance, CharacterSheet>()

/**
 * A character sheet as it stands in the office.
 *
 * The same sheet, at the same size. This used to resample the art down and no
 * longer does; the function survives as the name the world asks by, so the
 * decision about how characters are sized in the world stays in one place
 * rather than being spread across the renderer, the engine and the preview.
 */
export function buildWorldSheet(appearance: CharacterAppearance): CharacterSheet {
  const hit = sheets.get(appearance)
  if (hit) return hit
  const made = buildCharacterSheet(appearance)
  sheets.set(appearance, made)
  return made
}

/** Source rectangle for one frame within a world-scale sheet. */
export const worldFrameRect = frameRect

/**
 * A one-colour stamp of a single frame, for the hover outline.
 *
 * Made on demand into a shared scratch canvas rather than baked as a second
 * full sheet per character. A silhouette sheet is exactly as large as the art
 * it flattens, so baking one for everybody doubled the office's texture memory
 * to serve the one character the pointer happens to be over. At most one is
 * needed at a time, and rebuilding a twenty-by-thirty stamp is four canvas
 * calls.
 */
export function makeSilhouette(): {
  stamp: (
    sheet: HTMLCanvasElement,
    sx: number,
    sy: number,
    colour: string
  ) => HTMLCanvasElement
} {
  const { canvas, ctx } = createPixelCanvas(SPRITE_W, SPRITE_H)
  return {
    stamp(sheet, sx, sy, colour) {
      ctx.clearRect(0, 0, SPRITE_W, SPRITE_H)
      ctx.globalCompositeOperation = 'source-over'
      ctx.drawImage(sheet, sx, sy, SPRITE_W, SPRITE_H, 0, 0, SPRITE_W, SPRITE_H)
      ctx.globalCompositeOperation = 'source-in'
      ctx.fillStyle = colour
      ctx.fillRect(0, 0, SPRITE_W, SPRITE_H)
      ctx.globalCompositeOperation = 'source-over'
      return canvas
    }
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
