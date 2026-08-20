import type { Op } from '../world/pixel/ops'
import type { CharacterDef, Facing } from '../characters/character.types'

/**
 * A theme owns everything the user *sees*: the palette, the world, and who
 * the agents are portrayed as. Swapping the detective office for a space
 * station or a cyberpunk HQ means supplying a different Theme, and nothing
 * in the agent layer changes.
 */

export interface ThemePalette {
  /** #FFC94F and the shades derived around it. */
  brand: string
  brandLite: string
  brandPale: string
  brandDeep: string
  brandShadow: string

  ink: string
  ink2: string
  ink3: string

  cream: string
  cream2: string
  white: string

  wall: string
  wallLite: string
  wallShade: string

  floor: string
  floorAlt: string
  floorLine: string
  floorShadow: string

  wood: string
  woodDark: string
  woodLite: string

  screen: string
  screenLite: string

  sage: string
  sageDark: string
  sageLite: string

  rust: string
  cork: string
  corkDark: string

  /**
   * Each world's signature colour, used by the shared furniture so the same
   * couch or bench reads as belonging to this theme. Distinct from `brand`,
   * which is always Backstage yellow and never changes with the world.
   */
  accent: string
  accentLite: string
  accentDark: string

  paper: string
  paperShade: string

  steel: string
  steelDark: string

  [key: string]: string
}

/** A place a character can stand, and the way they face once there. */
export interface Spot {
  x: number
  y: number
  facing: Facing
}

/** A piece of furniture. `baseY` is its sort key against the cast. */
export interface Prop {
  id: string
  ops: Op[]
  baseY: number
}

export interface SceneDef {
  /** Logical pixel size. Rendered at an integer scale, never resampled. */
  width: number
  height: number
  /** Where the wall meets the floor. */
  horizon: number

  /** Static art behind everything, never sorted. */
  background: Op[]
  /** Sorted against characters by `baseY`. */
  props: Prop[]

  /** Desks a character can sit and work at. */
  desks: Spot[]
  /** Positions in front of the evidence board. */
  boardSpots: Spot[]
  /** Pairs of facing positions used for conversations. */
  talkSpots: [Spot, Spot][]
  /** The coffee station. */
  coffeeSpots: Spot[]
  /** Loitering positions used when an agent is idle. */
  wanderSpots: Spot[]

  /** Characters route along this corridor when crossing the office. */
  laneY: number

  /** Screen positions of monitors, so the renderer can animate them. */
  monitors: { x: number; y: number }[]
  /** Depth of the desk row, so monitor and LED overlays sort with it. */
  deskBaseY: number
  /** Where steam rises from, and the prop depth it belongs to. */
  steamVents: { x: number; y: number; baseY: number }[]
  /** Blinking status LEDs. */
  leds: { x: number; y: number }[]
  /** Centre of the wall clock. */
  clock: { x: number; y: number; r: number }
  /**
   * Vertical shafts of light the room's windows throw, as [x0, x1] pairs.
   *
   * The renderer drifts dust through these. It used to assume where a world's
   * windows were, which was true of the one room that existed when it was
   * written and wrong for every world added afterwards — dust hung in the
   * middle of a wall in half the themes. A scene now says where its own light
   * falls.
   */
  lightColumns?: [number, number][]
}

export interface Theme {
  id: string
  name: string
  tagline: string
  palette: ThemePalette
  scene: SceneDef
  characters: CharacterDef[]
}

/** Themes that exist as concepts but are not built yet. */
export interface ThemeTeaser {
  id: string
  name: string
  blurb: string
  /** Small pixel preview, drawn at this size. */
  preview: { width: number; height: number; ops: Op[] }
}
