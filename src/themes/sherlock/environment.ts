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
  meetingTable,
  plant,
  rug,
  shelfUnit,
  windowUnit
} from '../shared/props'
import {
  armchair,
  bookcase,
  coffeeTable,
  doorway,
  fireplace,
  noticeBoard,
  poster,
  sideTable,
  taskChair,
  wallLamp
} from '../shared/furniture'

/** A dark London study: deep teal walls, dark wood, lamplight and firelight. */
export const sherlockPalette: ThemePalette = {
  brand: '#FFC94F',
  brandLite: '#FFE29A',
  brandPale: '#F6E3B4',
  brandDeep: '#D9973A',
  brandShadow: '#A56B1E',

  ink: '#14191C',
  ink2: '#232C30',
  ink3: '#3E4A50',

  cream: '#E5DCC8',
  cream2: '#CFC4AB',
  white: '#F6F1E4',

  wall: '#3A4A4E',
  wallLite: '#485B60',
  wallShade: '#2B383B',

  floor: '#5B4632',
  floorLit: '#6E5740',
  floorAlt: '#4F3D2B',
  floorLine: '#3F3123',
  floorShadow: '#2E241A',

  wood: '#7A5636',
  woodDark: '#553A24',
  woodLite: '#9C7248',

  screen: '#161D22',
  screenLite: '#24303A',

  sage: '#5E7A55',
  sageDark: '#42583B',
  sageLite: '#7E9B72',

  rust: '#8C3A3A',
  cork: '#8F6E45',
  corkDark: '#6D5233',

  accent: '#8C3A3A',
  accentLite: '#AC5252',
  accentDark: '#642727',

  paper: '#EFE7D4',
  paperShade: '#D2C8B0',

  steel: '#8D959A',
  steelDark: '#5E686D'
}

/** Sash windows at the ends, books and the case wall between. */
function wall(slot: WallSlot): Op[] {
  switch (slot.index) {
    case 0:
    case 4:
      return windowUnit(slot.x, slot.y, slot.w, slot.h)
    case 1:
    case 3:
      return shelfUnit(slot.x + 12, slot.y, slot.w - 24)
    default:
      return noticeBoard(slot.x, slot.y, slot.w, slot.h, 91)
  }
}

function zone(z: ZoneRect): ZoneFurnishing {
  /*
   * Left: the fireside. The hearth itself is against the side wall rather
   * than standing in the middle of the room — a fireplace floating on a rug
   * read as a hole in the floor, and a chimney has to be in a wall.
   */
  if (z.index === 0) {
    return {
      props: [
        { id: 'rug', ops: rug(z.cx - 70, z.baseY - 44, 140, 58), baseY: 0 },
        { id: 'armchair-l', ops: armchair(z.cx - 46, z.baseY), baseY: z.baseY },
        { id: 'armchair-r', ops: armchair(z.cx + 28, z.baseY), baseY: z.baseY },
        { id: 'coffee-table', ops: coffeeTable(z.cx - 16, z.baseY + 22), baseY: z.baseY + 22 }
      ]
    }
  }

  // Middle: the library, and the table the case notes are spread across.
  if (z.index === 1) {
    return {
      props: [
        { id: 'bookcase', ops: bookcase(z.cx - 52, z.baseY, 34, 56), baseY: z.baseY },
        { id: 'table', ops: meetingTable(z.cx - 4, z.baseY), baseY: z.baseY },
        { id: 'chair-f', ops: taskChair(z.cx + 26, z.baseY + 18, 'up'), baseY: z.baseY + 18 }
      ]
    }
  }

  // Right: tea, taken seriously.
  const coffee = coffeeStation(z.cx - 26, z.baseY)
  return {
    props: [
      { id: 'coffee', ops: coffee.ops, baseY: z.baseY },
      { id: 'side-table', ops: sideTable(z.cx + 36, z.baseY + 16), baseY: z.baseY + 16 },
      { id: 'plant-r', ops: plant(z.cx - 52, z.baseY + 4, 9), baseY: z.baseY + 4 }
    ],
    steam: [{ x: coffee.steam.x, y: coffee.steam.y, baseY: z.baseY }]
  }
}

/**
 * Lamplight rather than pendants. The study is lit from the walls, which is
 * what keeps it feeling like gaslight instead of an office ceiling.
 */
function accents(grid: OfficeGrid): Prop[] {
  const list: Prop[] = []

  const doorX = Math.round((grid.wall[0].x + grid.wall[0].w + grid.wall[1].x) / 2) - 17
  list.push({ id: 'door', ops: doorway(doorX, grid.horizon - 4), baseY: 0 })

  for (const slot of grid.stations) {
    if (slot.row === 0) {
      list.push({ id: `lamp-${slot.index}`, ops: wallLamp(slot.cx, 58), baseY: 0 })
    }
    const seat = { x: slot.x + 30, y: slot.y + 5 }
    list.push({
      id: `chair-${slot.index}`,
      ops: chairBack(seat.x, seat.y),
      baseY: seat.y - 6
    })
  }

  list.push({
    id: 'portrait',
    ops: poster(grid.wall[2].cx - 16, grid.wall[2].y + grid.wall[2].h + 12, 32, 20, 61),
    baseY: 0
  })

  // The hearth, set into the left wall, and shelving opposite it.
  const [left, right] = grid.flanks
  list.push({ id: 'fireplace', ops: fireplace(left.x, left.y, 44), baseY: left.y })
  list.push({ id: 'bookcase-r', ops: bookcase(right.x + 6, right.y, 30, 54), baseY: right.y })

  list.push({ id: 'plant-l', ops: plant(14, grid.laneY + 6, 21), baseY: grid.laneY + 6 })
  list.push({
    id: 'side-table-r',
    ops: sideTable(grid.width - 32, grid.height - 26),
    baseY: grid.height - 26
  })

  return list
}

export const sherlockScene: SceneDef = composeOffice({
  floorStyle: 'planks',
  wallStyle: 'panelled',
  wall,
  zone,
  accents,
  clock: { slot: 3, r: 9 }
})
