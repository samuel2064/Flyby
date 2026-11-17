import { useEffect, useState } from 'react'
import { isOffline } from '../lib/connectivity'

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => !isOffline())

  useEffect(() => {
    const update = () => setOnline(!isOffline())
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    update()
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  return online
}
