import { useState, useEffect, useCallback } from 'react'
import { apiUrl } from '../lib/apiUrl'

interface PushSubscriptionOptions {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

interface UsePushNotificationOptions {
  enabled?: boolean
  airportId?: string
}

function getNotificationPermission(): string {
  if (typeof window === 'undefined') return 'default'
  if (!('Notification' in window)) return 'denied'
  // Notification.permission is not in standard lib.dom.d.ts but is widely supported
  const NotificationClass = window.Notification as unknown as { permission: string };
  return NotificationClass.permission || 'default'
}

export function usePushNotification({ enabled = true, airportId }: UsePushNotificationOptions = {}) {
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isSupported = typeof navigator !== 'undefined' && 
    'serviceWorker' in navigator && 
    'PushManager' in window && 
    'Notification' in window

  const hasPermission = isSupported && getNotificationPermission() === 'granted'

  const getVapidPublicKey = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch(apiUrl('/api/notifications/vapid-public-key'))
      if (!res.ok) return null
      const data = await res.json()
      return data.publicKey || null
    } catch {
      return null
    }
  }, [])

  const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
  }

  const subscribeToPush = useCallback(async (): Promise<boolean> => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setError('Push notifications not supported')
      return false
    }

    if (!airportId) {
      setError('Airport ID required for subscription')
      return false
    }

    setLoading(true)
    setError(null)

    try {
      const registration = await navigator.serviceWorker.ready
      const vapidPublicKey = await getVapidPublicKey()

      if (!vapidPublicKey) {
        setError('Failed to get VAPID public key')
        return false
      }

      const existingSubscription = await registration.pushManager.getSubscription()
      if (existingSubscription) {
        setSubscription(existingSubscription)
        return true
      }

      const newSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      })

      // Send subscription to backend
      const subData = newSubscription.toJSON() as PushSubscriptionOptions
      const token = localStorage.getItem('auth_token')
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const res = await fetch(apiUrl('/api/notifications/subscribe'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          endpoint: subData.endpoint,
          keys: subData.keys,
          airportId,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to save subscription' }))
        setError(err.error || 'Failed to save subscription')
        return false
      }

      setSubscription(newSubscription)
      return true
    } catch (err) {
      console.error('Push subscription failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to subscribe to push notifications')
      return false
    } finally {
      setLoading(false)
    }
  }, [airportId, getVapidPublicKey])

  const unsubscribeFromPush = useCallback(async (): Promise<boolean> => {
    if (!subscription) return true

    setLoading(true)
    setError(null)

    try {
      const unsubscribed = await subscription.unsubscribe()
      if (unsubscribed) {
        setSubscription(null)
        return true
      }
      setError('Failed to unsubscribe')
      return false
    } catch (err) {
      console.error('Push unsubscription failed:', err)
      setError(err instanceof Error ? err.message : 'Failed to unsubscribe')
      return false
    } finally {
      setLoading(false)
    }
  }, [subscription])

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const NotificationClass = window.Notification as unknown as { 
      requestPermission: () => Promise<string>;
      permission: string;
    };
    if (!NotificationClass || !NotificationClass.requestPermission) {
      setError('Notifications not supported')
      return false
    }

    const permission = await NotificationClass.requestPermission()
    return permission === 'granted'
  }, [])

  useEffect(() => {
    if (enabled && 'serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then(async (registration) => {
        const existingSubscription = await registration.pushManager.getSubscription()
        if (existingSubscription) {
          setSubscription(existingSubscription)
        }
      }).catch(console.error)
    }
  }, [enabled])

  return {
    subscription,
    loading,
    error,
    isSupported,
    hasPermission,
    subscribe: subscribeToPush,
    unsubscribe: unsubscribeFromPush,
    requestPermission,
  }
}