import { useEffect, useState } from 'react'
import type { AuthUser } from '../../shared/providerApi'
import { initialsFor } from '../../stores/authStore'

interface Props {
  user: AuthUser | null
  size?: number
}

/**
 * The account's face.
 *
 * Google's picture when there is one, initials when there is not — and
 * initials again the moment the picture fails to load, which is the case a
 * plain `<img>` gets wrong. Those URLs point at a Google CDN, and this is a
 * desktop application that is frequently offline or behind a corporate proxy;
 * a broken-image glyph in the navigation bar reads as the app being broken
 * rather than as a photo being unavailable.
 *
 * Squared off with a hard border rather than rounded, so an account photo sits
 * in the interface the same way every other raised surface does.
 */
export function Avatar({ user, size = 24 }: Props) {
  const [failed, setFailed] = useState(false)
  const url = user?.avatarUrl ?? null

  // A different account, or the same account with a new picture, deserves a
  // fresh attempt — otherwise one failure hides every later photo.
  useEffect(() => setFailed(false), [url])

  const box = {
    width: size,
    height: size,
    // Type scales with the box so two letters still fit at 20px and are not
    // lost at 44px.
    fontSize: Math.max(9, Math.round(size * 0.4))
  }

  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        aria-hidden
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        style={{ width: size, height: size }}
        className="shrink-0 border-2 border-ink object-cover"
      />
    )
  }

  return (
    <span
      aria-hidden
      style={box}
      className="grid shrink-0 place-items-center border-2 border-ink bg-brand font-pixel font-bold leading-none text-on-brand"
    >
      {initialsFor(user)}
    </span>
  )
}
