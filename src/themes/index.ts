import type { Theme } from './types'
import { detectiveTheme } from './detective/theme'
import { friendsTheme } from './friends/theme'
import { officeTheme } from './office/theme'
import { sherlockTheme } from './sherlock/theme'
import { strangerTheme } from './stranger/theme'
import { labTheme } from './lab/theme'

/**
 * The theme registry.
 *
 * Adding a world means writing its folder and adding one line here. Nothing
 * in the renderer, the director or the agent runtime needs to know it exists:
 * they all work against `Theme` and `SceneDef`, never against a theme id.
 * There is deliberately no `if (theme === 'friends')` anywhere in the app.
 */
export const themes: Record<string, Theme> = {
  detective: detectiveTheme,
  friends: friendsTheme,
  office: officeTheme,
  sherlock: sherlockTheme,
  stranger: strangerTheme,
  lab: labTheme
}

export const defaultThemeId = 'detective'

/** Registry order drives the switcher, so it is the one place to reorder. */
export const themeOrder: string[] = [
  'detective',
  'friends',
  'office',
  'sherlock',
  'stranger',
  'lab'
]

export const themeList: Theme[] = themeOrder.map((id) => themes[id])

export function getTheme(id: string = defaultThemeId): Theme {
  return themes[id] ?? themes[defaultThemeId]
}

export function isKnownTheme(id: string | null | undefined): boolean {
  return typeof id === 'string' && id in themes
}
