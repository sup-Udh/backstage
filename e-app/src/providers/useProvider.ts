import { useCallback, useEffect, useState } from 'react'
import { useBackstage } from '../stores/backstageStore'
import type { ConnectionResult } from '../shared/providerApi'

/**
 * The renderer's view of the OpenAI connection.
 *
 * Everything here goes through `window.backstage.openai`, which is the only
 * route to the provider. The key itself is never requested, received or held:
 * the most this side ever learns is that a key exists and its last four
 * characters.
 */
export function useProvider() {
  const provider = useBackstage((s) => s.provider)
  const setProvider = useBackstage((s) => s.setProvider)
  const [busy, setBusy] = useState<'connect' | 'test' | 'disconnect' | null>(null)
  const [result, setResult] = useState<ConnectionResult | null>(null)

  const refresh = useCallback(async () => {
    if (!window.backstage?.openai) return
    setProvider(await window.backstage.openai.getStatus())
  }, [setProvider])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const connect = useCallback(
    async (apiKey: string) => {
      setBusy('connect')
      setResult(null)
      try {
        const res = await window.backstage.openai.connect(apiKey)
        setResult(res)
        if (res.status) setProvider(res.status)
        return res
      } finally {
        setBusy(null)
      }
    },
    [setProvider]
  )

  const test = useCallback(async () => {
    setBusy('test')
    setResult(null)
    try {
      const res = await window.backstage.openai.testConnection()
      setResult(res)
      if (res.status) setProvider(res.status)
      return res
    } finally {
      setBusy(null)
    }
  }, [setProvider])

  const disconnect = useCallback(async () => {
    setBusy('disconnect')
    setResult(null)
    try {
      setProvider(await window.backstage.openai.disconnect())
    } finally {
      setBusy(null)
    }
  }, [setProvider])

  const selectModel = useCallback(
    async (modelId: string) => {
      setProvider(await window.backstage.openai.selectModel(modelId))
    },
    [setProvider]
  )

  return {
    provider,
    busy,
    result,
    clearResult: () => setResult(null),
    refresh,
    connect,
    test,
    disconnect,
    selectModel
  }
}
