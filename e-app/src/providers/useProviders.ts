import { useCallback, useEffect, useState } from 'react'
import type {
  ConnectionResult,
  ProviderDescriptor,
  ProviderStatus,
  WorkspaceInfo
} from '../shared/providerApi'
import { useBackstage } from '../stores/backstageStore'
import { useTeam } from '../stores/teamStore'

/**
 * The renderer's view of providers and the workspace.
 *
 * Everything goes through `window.backstage`, which is the only route to
 * either. No key is ever requested or received: the most this side learns is
 * that a key exists and its last four characters.
 *
 * Generic over the registry — the UI renders whatever providers the main
 * process reports, so adding one needs no change here.
 */
export function useProviders() {
  const [descriptors, setDescriptors] = useState<ProviderDescriptor[]>([])
  const [statuses, setStatuses] = useState<ProviderStatus[]>([])
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, ConnectionResult>>({})

  const refresh = useCallback(async () => {
    if (!window.backstage) return
    const [list, status, ws] = await Promise.all([
      window.backstage.providers.list(),
      window.backstage.providers.status(),
      window.backstage.workspace.get()
    ])
    setDescriptors(list)
    setStatuses(status)
    setWorkspace(ws)

    /*
     * Share the result rather than keeping it to this hook. Connecting a
     * provider changes which agents can run, so the roster's "why can't this
     * spawn?" answers and the chat header's model badges have to move with it
     * — otherwise a key added here leaves the Agents page still saying the
     * provider is missing until the app is restarted.
     */
    useBackstage.getState().setProviders(status)
    void useTeam.getState().refresh()
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const withBusy = useCallback(
    async <T,>(key: string, fn: () => Promise<T>): Promise<T> => {
      setBusy(key)
      try {
        return await fn()
      } finally {
        setBusy(null)
      }
    },
    []
  )

  const connect = useCallback(
    (providerId: string, apiKey: string) =>
      withBusy(`connect:${providerId}`, async () => {
        const res = await window.backstage.providers.connect(providerId, apiKey)
        setResults((r) => ({ ...r, [providerId]: res }))
        await refresh()
        return res
      }),
    [refresh, withBusy]
  )

  const test = useCallback(
    (providerId: string) =>
      withBusy(`test:${providerId}`, async () => {
        const res = await window.backstage.providers.test(providerId)
        setResults((r) => ({ ...r, [providerId]: res }))
        await refresh()
        return res
      }),
    [refresh, withBusy]
  )

  const disconnect = useCallback(
    (providerId: string) =>
      withBusy(`disconnect:${providerId}`, async () => {
        await window.backstage.providers.disconnect(providerId)
        setResults((r) => {
          const next = { ...r }
          delete next[providerId]
          return next
        })
        await refresh()
      }),
    [refresh, withBusy]
  )

  const selectModel = useCallback(
    async (providerId: string, modelId: string) => {
      await window.backstage.providers.selectModel(providerId, modelId)
      await refresh()
    },
    [refresh]
  )

  const chooseWorkspace = useCallback(
    () =>
      withBusy('workspace', async () => {
        setWorkspace(await window.backstage.workspace.choose())
      }),
    [withBusy]
  )

  const clearWorkspace = useCallback(async () => {
    setWorkspace(await window.backstage.workspace.clear())
  }, [])

  const anyConnected = statuses.some((s) => s.connected)

  return {
    descriptors,
    statuses,
    workspace,
    busy,
    results,
    anyConnected,
    refresh,
    connect,
    test,
    disconnect,
    selectModel,
    chooseWorkspace,
    clearWorkspace
  }
}
