import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

interface MockRedisInstance {
  on: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
  publish: ReturnType<typeof vi.fn>
  emit: ReturnType<typeof vi.fn>
}

const mockRedisInstances: MockRedisInstance[] = []

class MockRedisClass {
  on = vi.fn()
  subscribe = vi.fn((_channel: string, cb: (err: Error | null) => void) => cb(null))
  publish = vi.fn().mockResolvedValue(1)
  emit = vi.fn()
  
  constructor() {
    mockRedisInstances.push(this as unknown as MockRedisInstance)
  }
}

vi.mock('ioredis', () => {
  return { 
    default: MockRedisClass
  }
})

vi.mock('../src/prisma', () => ({
  prisma: {
    waitTime: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    checkpoint: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    airport: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    notificationSubscription: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    notificationPreference: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    reportFlag: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

describe('redis module', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv, MOCK_REDIS: '1' }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('publishWaitTime emits and subscribeCheckpoint receives', async () => {
    const { publishWaitTime, subscribeCheckpoint } = await import('../src/redis')
    
    const received: any[] = []
    const unsubscribe = await subscribeCheckpoint('ck-jfk-main', (data) => received.push(data))

    const testPayload = {
      checkpointId: 'ck-jfk-main',
      minutes: 15,
      source: 'crowd',
      reportType: 'standard',
      reportedAt: new Date('2024-01-01T12:00:00Z'),
    }

    await publishWaitTime(testPayload)

    expect(received).toHaveLength(1)
    expect(received[0]).toEqual(testPayload)

    unsubscribe()
  })

  it('subscribeCheckpoint returns unsubscribe function that stops receiving', async () => {
    const { publishWaitTime, subscribeCheckpoint } = await import('../src/redis')
    
    const received: any[] = []
    const unsubscribe = await subscribeCheckpoint('ck-jfk-main', (data) => received.push(data))

    const testPayload = {
      checkpointId: 'ck-jfk-main',
      minutes: 20,
      source: 'crowd',
      reportType: 'standard',
      reportedAt: new Date('2024-01-01T12:00:00Z'),
    }

    await publishWaitTime(testPayload)
    expect(received).toHaveLength(1)

    unsubscribe()
    
    const testPayload2 = {
      checkpointId: 'ck-jfk-main',
      minutes: 25,
      source: 'crowd',
      reportType: 'standard',
      reportedAt: new Date('2024-01-01T12:01:00Z'),
    }
    await publishWaitTime(testPayload2)
    
    expect(received).toHaveLength(1)
  })

  it('subscribeCheckpoint with "*" receives all checkpoints', async () => {
    const { publishWaitTime, subscribeCheckpoint } = await import('../src/redis')
    
    const received: any[] = []
    const unsubscribe = await subscribeCheckpoint('*', (data) => received.push(data))

    const testPayload1 = {
      checkpointId: 'ck-jfk-main',
      minutes: 10,
      source: 'crowd',
      reportType: 'standard',
      reportedAt: new Date('2024-01-01T12:00:00Z'),
    }
    const testPayload2 = {
      checkpointId: 'ck-lax-main',
      minutes: 15,
      source: 'crowd',
      reportType: 'standard',
      reportedAt: new Date('2024-01-01T12:00:00Z'),
    }

    await publishWaitTime(testPayload1)
    await publishWaitTime(testPayload2)

    expect(received).toHaveLength(2)
    expect(received[0].checkpointId).toBe('ck-jfk-main')
    expect(received[1].checkpointId).toBe('ck-lax-main')

    unsubscribe()
  })

  it('subscribeCheckpoint filters by checkpointId', async () => {
    const { publishWaitTime, subscribeCheckpoint } = await import('../src/redis')
    
    const received: any[] = []
    const unsubscribe = await subscribeCheckpoint('ck-jfk-main', (data) => received.push(data))

    const testPayload1 = {
      checkpointId: 'ck-jfk-main',
      minutes: 10,
      source: 'crowd',
      reportType: 'standard',
      reportedAt: new Date('2024-01-01T12:00:00Z'),
    }
    const testPayload2 = {
      checkpointId: 'ck-lax-main',
      minutes: 15,
      source: 'crowd',
      reportType: 'standard',
      reportedAt: new Date('2024-01-01T12:00:00Z'),
    }

    await publishWaitTime(testPayload1)
    await publishWaitTime(testPayload2)

    expect(received).toHaveLength(1)
    expect(received[0].checkpointId).toBe('ck-jfk-main')

    unsubscribe()
  })

  it('waitTimeChannel is exported and correct', async () => {
    const { waitTimeChannel } = await import('../src/redis')
    expect(waitTimeChannel).toBe('wait_time_updates')
  })

  it('redisClient, redisPub, redisSub are null when MOCK_REDIS=1', async () => {
    const { redisClient, redisPub, redisSub } = await import('../src/redis')
    expect(redisClient).toBeNull()
    expect(redisPub).toBeNull()
    expect(redisSub).toBeNull()
  })

  it('publishWaitTime works with different payload shapes', async () => {
    const { publishWaitTime, subscribeCheckpoint } = await import('../src/redis')
    
    const received: any[] = []
    const unsubscribe = await subscribeCheckpoint('*', (data) => received.push(data))

    const testPayload = {
      checkpointId: 'ck-ord-preclear',
      minutes: 45,
      source: 'official',
      reportType: 'preclear',
      reportedAt: new Date('2024-01-01T12:00:00Z'),
    }

    await publishWaitTime(testPayload)

    expect(received).toHaveLength(1)
    expect(received[0].checkpointId).toBe('ck-ord-preclear')
    expect(received[0].minutes).toBe(45)
    expect(received[0].source).toBe('official')
    expect(received[0].reportType).toBe('preclear')

    unsubscribe()
  })
})

describe('redis module with real Redis (MOCK_REDIS not set)', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    mockRedisInstances.length = 0
    process.env = { ...originalEnv }
    delete process.env.MOCK_REDIS
    delete process.env.REDIS_URL
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('redisClient, redisPub, redisSub are Redis instances when not mocked', async () => {
    const { redisClient, redisPub, redisSub } = await import('../src/redis')
    expect(redisClient).not.toBeNull()
    expect(redisPub).not.toBeNull()
    expect(redisSub).not.toBeNull()
    expect(typeof redisClient!.on).toBe('function')
    expect(typeof redisPub!.on).toBe('function')
    expect(typeof redisSub!.on).toBe('function')
    expect(mockRedisInstances).toHaveLength(3)
  })

  it('publishWaitTime and subscribeCheckpoint work with real Redis instances', async () => {
    const { publishWaitTime, subscribeCheckpoint, redisPub } = await import('../src/redis')
    
    expect(redisPub).not.toBeNull()
    expect(typeof redisPub!.publish).toBe('function')
    
    const received: any[] = []
    const unsubscribe = await subscribeCheckpoint('ck-jfk-main', (data) => received.push(data))

    const testPayload = {
      checkpointId: 'ck-jfk-main',
      minutes: 30,
      source: 'crowd',
      reportType: 'standard',
      reportedAt: new Date('2024-01-01T12:00:00Z'),
    }

    await publishWaitTime(testPayload)

    expect(mockRedisInstances[1].publish).toHaveBeenCalled()
    
    unsubscribe()
  })

  it('redisSub message handler parses and emits wait time updates to subscribers', async () => {
    const { redisSub, subscribeCheckpoint, waitTimeChannel } = await import('../src/redis')
    
    expect(redisSub).not.toBeNull()
    expect(mockRedisInstances).toHaveLength(3)
    const redisSubMock = mockRedisInstances[2]
    
    const received: any[] = []
    const unsubscribe = await subscribeCheckpoint('ck-sfo-main', (data) => received.push(data))

    // Simulate a Redis message event on the subscribed channel
    const testMessage = JSON.stringify({
      checkpointId: 'ck-sfo-main',
      minutes: 25,
      source: 'crowd',
      reportType: 'standard',
      reportedAt: '2024-01-01T12:00:00.000Z',
    })

    // Get the message handler that was registered via redisSub.on('message', ...)
    const messageHandler = redisSubMock.on.mock.calls.find(
      (call: any[]) => call[0] === 'message'
    )?.[1]
    
    expect(messageHandler).toBeDefined()
    
    // Call the message handler with the test channel and message
    messageHandler!(waitTimeChannel, testMessage)

    expect(received).toHaveLength(1)
    expect(received[0].checkpointId).toBe('ck-sfo-main')
    expect(received[0].minutes).toBe(25)
    expect(received[0].source).toBe('crowd')
    expect(received[0].reportType).toBe('standard')
    expect(received[0].reportedAt).toBe('2024-01-01T12:00:00.000Z')

    unsubscribe()
  })

  it('redisSub message handler ignores messages on other channels', async () => {
    const { redisSub, subscribeCheckpoint, waitTimeChannel } = await import('../src/redis')
    
    const redisSubMock = mockRedisInstances[2]
    const received: any[] = []
    const unsubscribe = await subscribeCheckpoint('ck-jfk-main', (data) => received.push(data))

    const messageHandler = redisSubMock.on.mock.calls.find(
      (call: any[]) => call[0] === 'message'
    )?.[1]
    
    expect(messageHandler).toBeDefined()
    
    // Send message on different channel - should be ignored
    messageHandler!('other_channel', JSON.stringify({
      checkpointId: 'ck-jfk-main',
      minutes: 10,
      source: 'crowd',
      reportType: 'standard',
      reportedAt: '2024-01-01T12:00:00.000Z',
    }))

    expect(received).toHaveLength(0)

    unsubscribe()
  })

  it('redisSub message handler handles parse errors gracefully', async () => {
    const { redisSub, subscribeCheckpoint, waitTimeChannel } = await import('../src/redis')
    
    const redisSubMock = mockRedisInstances[2]
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    
    const received: any[] = []
    const unsubscribe = await subscribeCheckpoint('ck-jfk-main', (data) => received.push(data))

    const messageHandler = redisSubMock.on.mock.calls.find(
      (call: any[]) => call[0] === 'message'
    )?.[1]
    
    expect(messageHandler).toBeDefined()
    
    // Send invalid JSON - should not crash and should log error
    messageHandler!(waitTimeChannel, 'not valid json')

    expect(received).toHaveLength(0)
    expect(consoleSpy).toHaveBeenCalled()
    
    consoleSpy.mockRestore()
    unsubscribe()
  })
})