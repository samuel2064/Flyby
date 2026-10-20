import Redis from 'ioredis'
import { EventEmitter } from 'events'

function createRedisClient(_label: string) {
  const url = process.env.REDIS_URL || 'redis://localhost:6379'
  if (process.env.MOCK_REDIS === '1' || url === 'redis://mock') {
    return null
  }
  return new Redis(url, { retryStrategy: () => null, showFriendlyErrorStack: true })
}

const redisClient = createRedisClient('client')
const redisPub = createRedisClient('pub')
const redisSub = createRedisClient('sub')

class MockRedis extends EventEmitter {
  publish(): Promise<number> { return Promise.resolve(0) }
  subscribe(): Promise<void> { return Promise.resolve() }
  onMessage(_data: unknown) { /* no-op */ }
}

const mockRedis = new MockRedis()

function getSafePublisher() {
  return redisPub ?? mockRedis
}

const waitTimeChannel = 'wait_time_updates'

if (redisSub) {
  void redisSub.subscribe(waitTimeChannel, (err) => {
    if (err) console.error('Redis subscribe error:', err)
  })

  redisSub.on('message', (channel, message) => {
    if (channel === waitTimeChannel) {
      try {
        const data = JSON.parse(message) as WaitTimePayload
        waitTimeEmitter.emit('update', data)
      } catch (e) {
        console.error('Failed to parse redis message', e)
      }
    }
  })
}

interface WaitTimePayload {
  checkpointId: string
  minutes: number
  source?: string
  reportType?: string
  reportedAt: Date
}

class WaitTimeEmitter extends EventEmitter {}
const waitTimeEmitter = new WaitTimeEmitter()

async function publishWaitTime(data: WaitTimePayload): Promise<void> {
  const pub = getSafePublisher()
  if (pub instanceof Redis) {
    await pub.publish(waitTimeChannel, JSON.stringify(data))
  } else {
    // In-memory: emit directly so local SSE listeners still work
    waitTimeEmitter.emit('update', data)
  }
}

// Allow Express route to subscribe to updates for a checkpoint
// Use checkpointId="*" to subscribe to all checkpoints
async function subscribeCheckpoint(checkpointId: string, onUpdate: (data: WaitTimePayload) => void): Promise<() => void> {
  const handler = (data: WaitTimePayload) => {
    if (checkpointId === "*" || data.checkpointId === checkpointId) {
      onUpdate(data)
    }
  }
  waitTimeEmitter.on('update', handler)
  return () => waitTimeEmitter.off('update', handler)
}

export { redisClient, redisPub, redisSub, publishWaitTime, subscribeCheckpoint, waitTimeChannel }
