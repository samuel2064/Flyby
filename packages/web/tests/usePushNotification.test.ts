import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePushNotification } from '../src/hooks/usePushNotification'

// Mock navigator
const mockPushManager = {
  subscribe: vi.fn(),
  getSubscription: vi.fn(),
}

const mockServiceWorker = {
  ready: Promise.resolve({
    pushManager: mockPushManager,
  }),
}

const createMockNotification = (permission = 'default') => ({
  requestPermission: vi.fn(),
  permission,
})

let mockNotification = createMockNotification()

// Save original globals
const originalNavigator = global.navigator
const originalNotification = global.Notification
const originalWindow = global.window
const originalPushManager = (global as any).PushManager

describe('usePushNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNotification = createMockNotification('default')
    
    // Mock navigator on both global and window
    const mockNavigator = {
      serviceWorker: mockServiceWorker,
      pushManager: mockPushManager,
    }
    global.navigator = mockNavigator as any
    global.window = { ...global.window, navigator: mockNavigator } as any
    
    // Mock Notification
    global.Notification = mockNotification as any
    global.window.Notification = mockNotification as any
    
    // Mock PushManager on window to make 'PushManager' in window return true
    global.PushManager = vi.fn()
    global.window.PushManager = global.PushManager
    
    mockPushManager.subscribe.mockReset()
    mockPushManager.getSubscription.mockReset()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.resetAllMocks()
    // Restore original globals
    global.navigator = originalNavigator
    global.Notification = originalNotification
    global.window = originalWindow
    global.PushManager = originalPushManager
  })

  it('initializes with default state', () => {
    const { result } = renderHook(() => usePushNotification())
    
    expect(result.current.subscription).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(typeof result.current.isSupported).toBe('boolean')
    expect(typeof result.current.hasPermission).toBe('boolean')
    expect(typeof result.current.subscribe).toBe('function')
    expect(typeof result.current.unsubscribe).toBe('function')
    expect(typeof result.current.requestPermission).toBe('function')
  })

  it('returns isSupported as false when serviceWorker not available', () => {
    global.navigator = {} as any
    global.window.navigator = {} as any
    const { result } = renderHook(() => usePushNotification())
    expect(result.current.isSupported).toBe(false)
    const mockNavigator = {
      serviceWorker: mockServiceWorker,
      pushManager: mockPushManager,
    }
    global.navigator = mockNavigator as any
    global.window.navigator = mockNavigator as any
  })

  it('requestPermission calls Notification.requestPermission', async () => {
    mockNotification.requestPermission.mockResolvedValue('granted')
    
    const { result } = renderHook(() => usePushNotification())
    let permission: boolean
    await act(async () => {
      permission = await result.current.requestPermission()
    })
    
    expect(mockNotification.requestPermission).toHaveBeenCalled()
    expect(permission).toBe(true)
  })

  it('requestPermission returns false when denied', async () => {
    mockNotification.requestPermission.mockResolvedValue('denied')
    
    const { result } = renderHook(() => usePushNotification())
    let permission: boolean
    await act(async () => {
      permission = await result.current.requestPermission()
    })
    
    expect(permission).toBe(false)
  })

  it('requestPermission returns false when Notification.requestPermission not available', async () => {
    global.Notification = { requestPermission: undefined as any, permission: 'default' } as any
    global.window.Notification = global.Notification
    
    const { result } = renderHook(() => usePushNotification())
    let success: boolean
    await act(async () => {
      success = await result.current.requestPermission()
    })
    
    expect(success).toBe(false)
    
    global.Notification = mockNotification as any
    global.window.Notification = mockNotification as any
  })

  it('subscribe returns false when airportId not provided', async () => {
    const { result } = renderHook(() => usePushNotification({ enabled: true }))
    
    let success: boolean
    await act(async () => {
      success = await result.current.subscribe()
    })
    
    expect(success).toBe(false)
    expect(result.current.error).toBe('Airport ID required for subscription')
  })

  it('subscribe returns false when VAPID fetch fails', async () => {
    mockPushManager.getSubscription.mockResolvedValue(null)
    
    const { result } = renderHook(() => usePushNotification({ enabled: true, airportId: 'test-uuid' }))
    
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))
    
    let success: boolean
    await act(async () => {
      success = await result.current.subscribe()
    })
    
    expect(success).toBe(false)
    expect(result.current.error).toBe('Failed to get VAPID public key')
    
    global.fetch = originalFetch
  })

  it('subscribe returns false when pushManager.subscribe fails', async () => {
    mockPushManager.getSubscription.mockResolvedValue(null)
    
    const { result } = renderHook(() => usePushNotification({ enabled: true, airportId: 'test-uuid' }))
    
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ publicKey: 'test-vapid-key' }),
    })
    
    mockPushManager.subscribe.mockRejectedValue(new Error('Subscribe failed'))
    
    let success: boolean
    await act(async () => {
      success = await result.current.subscribe()
    })
    
    expect(success).toBe(false)
    expect(result.current.error).toBe('Subscribe failed')
    
    global.fetch = vi.fn()
  })

  it('subscribe returns false when API call to save subscription fails', async () => {
    mockPushManager.getSubscription.mockResolvedValue(null)
    
    const { result } = renderHook(() => usePushNotification({ enabled: true, airportId: 'test-uuid' }))
    
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ publicKey: 'test-vapid-key' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Failed to save subscription' }),
      })
    
    mockPushManager.subscribe.mockResolvedValue({
      toJSON: () => ({
        endpoint: 'https://push.example.com/endpoint',
        keys: { p256dh: 'key1', auth: 'key2' },
      }),
    })
    
    let success: boolean
    await act(async () => {
      success = await result.current.subscribe()
    })
    
    expect(success).toBe(false)
    expect(result.current.error).toBe('Failed to save subscription')
    
    global.fetch = vi.fn()
  })

  it('subscribe succeeds and sets subscription when all steps pass', async () => {
    mockPushManager.getSubscription.mockResolvedValue(null)
    
    const { result } = renderHook(() => usePushNotification({ enabled: true, airportId: 'test-uuid' }))
    
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ publicKey: 'test-vapid-key' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'sub-1', airportId: 'test-uuid', createdAt: new Date().toISOString() }),
      })
    
    const mockSubscription = {
      toJSON: () => ({
        endpoint: 'https://push.example.com/endpoint',
        keys: { p256dh: 'key1', auth: 'key2' },
      }),
      unsubscribe: vi.fn().mockResolvedValue(true),
    }
    mockPushManager.subscribe.mockResolvedValue(mockSubscription)
    
    let success: boolean
    await act(async () => {
      success = await result.current.subscribe()
    })
    
    expect(success).toBe(true)
    expect(result.current.subscription).toBe(mockSubscription)
    expect(result.current.error).toBeNull()
    
    global.fetch = vi.fn()
  })

  it('subscribe uses existing subscription if already present', async () => {
    const existingSubscription = {
      toJSON: () => ({
        endpoint: 'https://push.example.com/existing',
        keys: { p256dh: 'existing-key', auth: 'existing-auth' },
      }),
      unsubscribe: vi.fn().mockResolvedValue(true),
    }
    mockPushManager.getSubscription.mockResolvedValue(existingSubscription)
    
    const { result } = renderHook(() => usePushNotification({ enabled: true, airportId: 'test-uuid' }))
    
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ publicKey: 'test-vapid-key' }),
    })
    
    let success: boolean
    await act(async () => {
      success = await result.current.subscribe()
    })
    
    expect(success).toBe(true)
    expect(result.current.subscription).toBe(existingSubscription)
    expect(mockPushManager.subscribe).not.toHaveBeenCalled()
    expect(global.fetch).toHaveBeenCalledTimes(1) // Only VAPID fetch
    
    global.fetch = vi.fn()
  })

  it('unsubscribe returns true when no subscription exists', async () => {
    const { result } = renderHook(() => usePushNotification())
    
    let success: boolean
    await act(async () => {
      success = await result.current.unsubscribe()
    })
    
    expect(success).toBe(true)
  })

  it('checks for existing subscription on mount when enabled', async () => {
    const existingSubscription = {
      toJSON: () => ({
        endpoint: 'https://push.example.com/existing',
        keys: { p256dh: 'existing-key', auth: 'existing-auth' },
      }),
      unsubscribe: vi.fn().mockResolvedValue(true),
    }
    mockPushManager.getSubscription.mockResolvedValue(existingSubscription)
    
    // Create a service worker mock that resolves immediately
    const readyPromise = Promise.resolve({
      pushManager: mockPushManager,
    })
    const mockNavigator = {
      serviceWorker: { ready: readyPromise },
      pushManager: mockPushManager,
    }
    global.navigator = mockNavigator as any
    global.window.navigator = mockNavigator as any
    
    const { result } = renderHook(() => usePushNotification({ enabled: true, airportId: 'test-uuid' }))
    
    // Wait for useEffect to run
    await act(async () => {
      await Promise.resolve()
      vi.advanceTimersByTime(100)
    })
    
    // Poll for the subscription to be set
    await vi.waitFor(() => {
      expect(result.current.subscription).toBe(existingSubscription)
    }, { timeout: 2000 })
  })

  it('does not check for existing subscription when disabled', async () => {
    const { result } = renderHook(() => usePushNotification({ enabled: false, airportId: 'test-uuid' }))
    
    // useEffect should not run when disabled
    await act(async () => {
      vi.advanceTimersByTime(100)
      await Promise.resolve()
    })
    
    expect(mockPushManager.getSubscription).not.toHaveBeenCalled()
  })

  it('includes auth token in subscription request when available', async () => {
    mockPushManager.getSubscription.mockResolvedValue(null)
    
    const originalLocalStorage = global.localStorage
    global.localStorage = {
      ...originalLocalStorage,
      getItem: vi.fn().mockReturnValue('test-jwt-token'),
    }
    
    const { result } = renderHook(() => usePushNotification({ enabled: true, airportId: 'test-uuid' }))
    
    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ publicKey: 'test-vapid-key' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'sub-1' }),
      })
    
    mockPushManager.subscribe.mockResolvedValue({
      toJSON: () => ({
        endpoint: 'https://push.example.com/endpoint',
        keys: { p256dh: 'key1', auth: 'key2' },
      }),
    })
    
    await act(async () => {
      await result.current.subscribe()
    })
    
    // Check that the second fetch (to /api/notifications/subscribe) included Authorization header
    const fetchCalls = (global.fetch as any).mock.calls
    expect(fetchCalls.length).toBe(2)
    const subscribeCall = fetchCalls[1]
    expect(subscribeCall[0]).toBe('/api/notifications/subscribe')
    expect(subscribeCall[1].headers.Authorization).toBe('Bearer test-jwt-token')
    
    global.fetch = vi.fn()
    global.localStorage = originalLocalStorage
  })

  it('unsubscribe returns true when no subscription exists', async () => {
    const { result } = renderHook(() => usePushNotification())
    
    let success: boolean
    await act(async () => {
      success = await result.current.unsubscribe()
    })
    
    expect(success).toBe(true)
  })

  it('unsubscribe successfully unsubscribes and clears subscription', async () => {
    const mockSubscription = {
      toJSON: () => ({
        endpoint: 'https://push.example.com/endpoint',
        keys: { p256dh: 'key1', auth: 'key2' },
      }),
      unsubscribe: vi.fn().mockResolvedValue(true),
    }
    mockPushManager.getSubscription.mockResolvedValue(mockSubscription)
    
    const { result } = renderHook(() => usePushNotification({ enabled: true, airportId: 'test-uuid' }))
    
    // Wait for initial subscription check
    await act(async () => {
      await Promise.resolve()
      vi.advanceTimersByTime(100)
    })
    
    // Now test unsubscribe
    let success: boolean
    await act(async () => {
      success = await result.current.unsubscribe()
    })
    
    expect(success).toBe(true)
    expect(mockSubscription.unsubscribe).toHaveBeenCalled()
    expect(result.current.subscription).toBeNull()
  })

  it('unsubscribe handles unsubscribe failure', async () => {
    const mockSubscription = {
      toJSON: () => ({
        endpoint: 'https://push.example.com/endpoint',
        keys: { p256dh: 'key1', auth: 'key2' },
      }),
      unsubscribe: vi.fn().mockResolvedValue(false),
    }
    mockPushManager.getSubscription.mockResolvedValue(mockSubscription)
    
    const { result } = renderHook(() => usePushNotification({ enabled: true, airportId: 'test-uuid' }))
    
    // Wait for initial subscription check
    await act(async () => {
      await Promise.resolve()
      vi.advanceTimersByTime(100)
    })
    
    // Now test unsubscribe failure
    let success: boolean
    await act(async () => {
      success = await result.current.unsubscribe()
    })
    
    expect(success).toBe(false)
    expect(result.current.error).toBe('Failed to unsubscribe')
  })

  it('unsubscribe handles unsubscribe error', async () => {
    const mockSubscription = {
      toJSON: () => ({
        endpoint: 'https://push.example.com/endpoint',
        keys: { p256dh: 'key1', auth: 'key2' },
      }),
      unsubscribe: vi.fn().mockRejectedValue(new Error('Unsubscribe failed')),
    }
    mockPushManager.getSubscription.mockResolvedValue(mockSubscription)
    
    const { result } = renderHook(() => usePushNotification({ enabled: true, airportId: 'test-uuid' }))
    
    // Wait for initial subscription check
    await act(async () => {
      await Promise.resolve()
      vi.advanceTimersByTime(100)
    })
    
    // Now test unsubscribe error
    let success: boolean
    await act(async () => {
      success = await result.current.unsubscribe()
    })
    
    expect(success).toBe(false)
    expect(result.current.error).toBe('Unsubscribe failed')
  })

  it('subscribe returns false when push notifications not supported', async () => {
    // Mock navigator without serviceWorker or PushManager
    global.navigator = {} as any
    global.window.navigator = {} as any
    
    const { result } = renderHook(() => usePushNotification({ enabled: true, airportId: 'test-uuid' }))
    
    let success: boolean
    await act(async () => {
      success = await result.current.subscribe()
    })
    
    expect(success).toBe(false)
    expect(result.current.error).toBe('Push notifications not supported')
    
    // Restore mock navigator
    const mockNavigator = {
      serviceWorker: mockServiceWorker,
      pushManager: mockPushManager,
    }
    global.navigator = mockNavigator as any
    global.window.navigator = mockNavigator as any
  })
})