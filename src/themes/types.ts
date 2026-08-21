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

/**
 * A workstation, and everything a body needs in order to use one.
 *
 * The office used to describe a desk as a single point — "stand here, face
 * down" — which is why characters read as sprites parked next to furniture
 * rather than people working at it. A desk is not a place, it is a small
 * sequence: you approach it from the front, you step in behind it, you sit,
 * and the thing you are looking at is a specific screen that should react to
 * you. All four of those are here, so the director never invents a coordinate
 * and the renderer never guesses whose monitor is whose.
 */
export interface Workstation {
  index: number
  /** Where the occupant's feet are once they are seated at the desk. */
  seat: Spot
  /**
   * Where they stand before sitting down and after standing up.
   *
   * In front of the desk and below its sort baseline, so an arriving
   * character is fully visible walking up to it and is then occluded from the
   * waist down as they step in behind it — which is what makes sitting read
   * as sitting rather than as a pose change.
   */
  stand: Spot
  /** Index into `SceneDef.monitors` of the screen this occupant drives. */
  monitor: number
  /** Depth sort baseline of the desk itself. */
  baseY: number
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

  /**
   * Desks a character can sit and work at.
   *
   * Kept as the seat positions of `workstations`, in the same order, because
   * a great deal of the app talks about "desk 3" and a character's home desk
   * is persisted as an index.
   */
  desks: Spot[]
  /** The same desks, with their approach, their seat and their screen. */
  workstations: Workstation[]
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

  /**
   * Screen positions of monitors, so the renderer can animate them.
   *
   * Each carries its own depth. They used to share the back row's, which put
   * every front-row screen at the wrong distance from the viewer — invisible
   * most of the time and wrong exactly when somebody walked between the rows.
   */
  monitors: { x: number; y: number; baseY: number }[]
  /** Depth of the back desk row. */
  deskBaseY: number
  /** Where steam rises from, and the prop depth it belongs to. */
  steamVents: { x: number; y: number; baseY: number }[]
  /** Blinking status LEDs. */
  leds: { x: number; y: number; baseY: number }[]
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
  /**
   * The room at its default size.
   *
   * Used by surfaces that draw a fixed crop of the world rather than living
   * inside it — the theme previews on the setup and settings pages. The
   * workspace does not use this: it builds the room to fit its panel.
   */
  scene: SceneDef
  /**
   * The room at a given logical size.
   *
   * There is no camera any more, so the world has to *be* the size of the
   * viewport rather than being panned around inside it. A wider room gets more
   * wall panels and more desks, a taller one more floor between its rows —
   * which is what makes filling a large window mean "a bigger office" rather
   * than "the same office, further away".
   */
  buildScene: (width: number, height: number) => SceneDef
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
