import { describe, it, expect, vi } from 'vitest'

// Mock PrismaClient before seed.ts imports it.
// Factory must be self-contained (no references to top-level variables)
// because Vitest hoists vi.mock() above everything else.
vi.mock('@prisma/client', () => {
  return {
    PrismaClient: class {
      $connect = vi.fn()
      $disconnect = vi.fn()
      $queryRaw = vi.fn().mockResolvedValue([{ now: new Date() }])
      user = {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        count: vi.fn().mockResolvedValue(0),
      }
      airport = {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        upsert: vi.fn().mockResolvedValue({ id: 'air-1' }),
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
      }
      checkpoint = {
        upsert: vi.fn().mockResolvedValue({ id: 'cp-1' }),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
      }
      waitTime = {
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        count: vi.fn().mockResolvedValue(0),
      }
    },
  }
})

// Import seed.ts *after* the PrismaClient mock is registered.
import { main as seedMain, getCheckpointsForAirport, data } from '../prisma/seed'

describe('Seed logic', () => {
  it('exports airports array with at least 50 airports', () => {
    expect(Array.isArray(data.airports)).toBe(true)
    expect(data.airports.length).toBeGreaterThanOrEqual(50)
  })

  it('returns checkpoints for known airport codes', () => {
    expect(getCheckpointsForAirport('JFK').length).toBeGreaterThan(0)
    expect(getCheckpointsForAirport('LAX').length).toBeGreaterThan(0)
    expect(getCheckpointsForAirport('DEN').length).toBeGreaterThan(0)
    expect(getCheckpointsForAirport('NONEXISTENT')).toEqual([])
  })

  it('seed function runs without error', async () => {
    await expect(seedMain()).resolves.toBeUndefined()
  })
})
