import type { Op } from '../../world/pixel/ops'
import type { Prop, SceneDef, ThemePalette } from '../types'
import {
  composeOffice,
  type OfficeGrid,
  type WallSlot,
  type ZoneFurnishing,
  type ZoneRect
} from '../shared/office'
import {
  chairBack,
  coffeeStation,
  plant,
  rug,
  windowUnit
} from '../shared/props'
import {
  armchair,
  bookcase,
  coffeeTable,
  couch,
  doorway,
  kitchenCounter,
  poster,
  sideTable,
  stool
} from '../shared/furniture'

/** A warm sitcom apartment: purple walls, an orange couch, late afternoon. */
export const friendsPalette: ThemePalette = {
  brand: '#FFC94F',
  brandLite: '#FFE29A',
  brandPale: '#FFF3D0',
  brandDeep: '#E8A128',
  brandShadow: '#C97F1C',

  ink: '#241C2E',
  ink2: '#3A2E48',
  ink3: '#5B4A6B',

  cream: '#FFF3E2',
  cream2: '#F2E0C8',
  white: '#FFFFFF',

  wall: '#9C7FB0',
  wallLite: '#B294C4',
  wallShade: '#816497',

  floor: '#D9BB90',
  floorLit: '#E7CDA8',
  floorAlt: '#CCAC7E',
  floorLine: '#B69163',
  floorShadow: '#A67F52',

  wood: '#B48A55',
  woodDark: '#8A6236',
  woodLite: '#D2A46E',

  screen: '#2A2338',
  screenLite: '#3B3150',

  sage: '#7E9C6B',
  sageDark: '#5C7A4C',
  sageLite: '#9EBB87',

  rust: '#C6642F',
  cork: '#C9A06B',
  corkDark: '#A9834F',

  accent: '#C6642F',
  accentLite: '#E08348',
  accentDark: '#96461E',

  paper: '#FFFDF5',
  paperShade: '#E7DFC9',

  steel: '#B9B2C4',
  steelDark: '#847C93'
}

/** The apartment's signature: an empty gilt frame hung on the wall. */
function giltFrame(x: number, y: number, w: number, h: number): Op[] {
  return [
    [x, y, w, h, 'brandShadow'],
    [x + 2, y + 2, w - 4, h - 4, 'brand'],
    [x + 4, y + 4, w - 8, h - 8, 'brandShadow'],
    [x + 5, y + 5, w - 10, h - 10, 'wall']
  ]
}

/** Big apartment windows at the ends, art and the frame between them. */
function wall(slot: WallSlot): Op[] {
  switch (slot.index) {
    case 0:
    case 4:
      return windowUnit(slot.x, slot.y, slot.w, slot.h)
    case 2:
      return giltFrame(slot.x + 18, slot.y - 2, slot.w - 36, slot.h + 6)
    default:
      return poster(slot.x + 16, slot.y, slot.w - 32, slot.h, slot.index * 17 + 5)
  }
}

function zone(z: ZoneRect): ZoneFurnishing {
  // Left: the living room. The couch everybody in the show sits on.
  if (z.index === 0) {
    return {
      props: [
        { id: 'rug', ops: rug(z.cx - 78, z.baseY - 50, 156, 66), baseY: 0 },
        { id: 'couch', ops: couch(z.cx - 40, z.baseY, 80), baseY: z.baseY },
        { id: 'coffee-table', ops: coffeeTable(z.cx - 16, z.baseY + 20), baseY: z.baseY + 20 },
        { id: 'armchair', ops: armchair(z.cx + 52, z.baseY + 6), baseY: z.baseY + 6 }
      ]
    }
  }

  // Middle: the reading corner, keeping the floor between the two ends open.
  if (z.index === 1) {
    return {
      props: [
        { id: 'bookcase', ops: bookcase(z.cx - 44, z.baseY, 30, 54), baseY: z.baseY },
        { id: 'side-table', ops: sideTable(z.cx + 2, z.baseY), baseY: z.baseY },
        { id: 'plant-mid', ops: plant(z.cx + 44, z.baseY, 15), baseY: z.baseY }
      ]
    }
  }

  // Right: the kitchen, and the coffee that the whole theme is named after.
  const coffee = coffeeStation(z.cx - 26, z.baseY)
  return {
    props: [
      { id: 'kitchen', ops: kitchenCounter(z.cx - 52, z.baseY - 22, 104), baseY: z.baseY - 22 },
      { id: 'coffee', ops: coffee.ops, baseY: z.baseY },
      { id: 'stool-1', ops: stool(z.cx - 36, z.baseY + 24), baseY: z.baseY + 24 },
      { id: 'stool-2', ops: stool(z.cx + 4, z.baseY + 26), baseY: z.baseY + 26 },
      { id: 'stool-3', ops: stool(z.cx + 40, z.baseY + 24), baseY: z.baseY + 24 }
    ],
    steam: [{ x: coffee.steam.x, y: coffee.steam.y, baseY: z.baseY }]
  }
}

function accents(grid: OfficeGrid): Prop[] {
  const list: Prop[] = []

  const doorX = Math.round((grid.wall[3].x + grid.wall[3].w + grid.wall[4].x) / 2) - 17
  list.push({ id: 'door', ops: doorway(doorX, grid.horizon - 4), baseY: 0 })

  for (const slot of grid.stations) {
    const seat = { x: slot.x + 30, y: slot.y + 5 }
    list.push({
      id: `chair-${slot.index}`,
      ops: chairBack(seat.x, seat.y),
      baseY: seat.y - 6
    })
  }

  const [left, right] = grid.flanks
  list.push({ id: 'bookcase-l', ops: bookcase(left.x, left.y, 28, 52), baseY: left.y })
  list.push({ id: 'armchair-r', ops: armchair(right.x + 8, right.y), baseY: right.y })
  list.push({ id: 'side-table-r', ops: sideTable(right.x - 2, right.y + 22), baseY: right.y + 22 })

  list.push({ id: 'plant-l', ops: plant(14, grid.laneY + 6, 6), baseY: grid.laneY + 6 })
  list.push({
    id: 'plant-r',
    ops: plant(grid.width - 26, grid.height - 24, 12),
    baseY: grid.height - 24
  })

  return list
}

export const friendsScene: SceneDef = composeOffice({
  floorStyle: 'planks',
  wallStyle: 'plain',
  wall,
  zone,
  accents,
  clock: { slot: 3, r: 8 }
})
