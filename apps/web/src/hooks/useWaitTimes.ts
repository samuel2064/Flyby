import { useCallback, useEffect, useRef, useState } from 'react'
import { getWaitTimes, POLL_FALLBACK_MS, subscribeToLiveUpdates } from '../api/waitTimes'
import type { WaitTime, WaitTimeUpdateEvent } from '../api/types'

type FetchState = 'idle' | 'loading' | 'ready' | 'error'

export interface UseWaitTimesResult {
  waitTimes: WaitTime[]
  state: FetchState
  lastUpdated: string | null
  live: boolean
  refresh: () => void
}

function applyUpdate(list: WaitTime[], event: WaitTimeUpdateEvent): WaitTime[] {
  if (event.type !== 'wait-time-update' || !event.checkpoint) return list
  const next: WaitTime = {
    airport: event.airport ?? '',
    checkpoint: event.checkpoint,
    waitMinutes: typeof event.waitMinutes === 'number' ? event.waitMinutes : 0,
    updatedAt: event.timestamp,
  }
  const index = list.findIndex(
    (w) => w.checkpoint.toLowerCase() === next.checkpoint.toLowerCase(),
  )
  if (index === -1) return [...list, next]
  const copy = [...list]
  copy[index] = { ...copy[index], ...next }
  return copy
}

export function useWaitTimes(airportCode: string): UseWaitTimesResult {
  const [waitTimes, setWaitTimes] = useState<WaitTime[]>([])
  const [state, setState] = useState<FetchState>('loading')
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [live, setLive] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)
  const liveRef = useRef(false)

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), [])

  useEffect(() => {
    let cancelled = false
    setState('loading')

    getWaitTimes(airportCode)
      .then((rows) => {
        if (cancelled) return
        setWaitTimes(rows)
        setLastUpdated(new Date().toISOString())
        setState('ready')
      })
      .catch(() => {
        if (cancelled) return
        setState('error')
      })

    return () => {
      cancelled = true
    }
  }, [airportCode, refreshTick])

  useEffect(() => {
    const subscription = subscribeToLiveUpdates(
      airportCode,
      (event) => {
        if (event.type === 'connected') {
          liveRef.current = true
          setLive(true)
          return
        }
        setWaitTimes((list) => applyUpdate(list, event))
        setLastUpdated(event.timestamp)
      },
      () => {
        if (liveRef.current) {
          liveRef.current = false
          setLive(false)
        }
      },
    )

    const poll = window.setInterval(() => {
      getWaitTimes(airportCode)
        .then((rows) => {
          if (rows.length > 0) {
            setWaitTimes(rows)
            setLastUpdated(new Date().toISOString())
          }
        })
        .catch(() => {})
    }, POLL_FALLBACK_MS)

    return () => {
      subscription.close()
      window.clearInterval(poll)
    }
  }, [airportCode])

  return { waitTimes, state, lastUpdated, live, refresh }
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'never'
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}
