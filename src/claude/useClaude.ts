import { useCallback, useEffect, useState } from 'react'
import type { ClaudeDetection } from '../shared/providerApi'

/**
 * Whether Claude Code is installed on this machine.
 *
 * A thin mirror of the main process's detection — the renderer never runs a
 * command, it asks a question. The answer is cached in the main process, so
 * mounting this in three places costs one probe rather than three.
 */

export interface ClaudeState {
  detection: ClaudeDetection | null
  /** True during the first look and during an explicit re-check. */
  checking: boolean
  /** Look again, ignoring the cache. For the "Test connection" button. */
  recheck: () => Promise<void>
}

export function useClaude(): ClaudeState {
  const [detection, setDetection] = useState<ClaudeDetection | null>(null)
  const [checking, setChecking] = useState(true)

  const load = useCallback(async (refresh: boolean) => {
    const api = window.backstage?.claude
    if (!api) {
      setChecking(false)
      return
    }
    setChecking(true)
    try {
      setDetection(await api.detect(refresh))
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    void load(false)
  }, [load])

  return { detection, checking, recheck: () => load(true) }
}

/**
 * The words for each state.
 *
 * Kept here rather than in each component so the terminal panel and the
 * settings card cannot end up describing the same machine differently — which
 * is exactly the confusion requirement 20 is about.
 */
export const CLAUDE_COPY: Record<
  ClaudeDetection['state'],
  { label: string; glyph: string; tone: 'ok' | 'warn' | 'bad' }
> = {
  available: { label: 'Available', glyph: '●', tone: 'ok' },
  not_installed: { label: 'Not installed', glyph: '!', tone: 'warn' },
  failed_to_start: { label: "Found, but won't run", glyph: '!', tone: 'bad' }
}

/** Where to send somebody who needs to install it. */
export const CLAUDE_INSTALL_URL = 'https://claude.com/product/claude-code'
