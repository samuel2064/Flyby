import { describe, it, expect } from 'vitest'
import { AIRPORTS, DEFAULT_AIRPORT, searchAirports, airportById, checkpointOptions, type Airport } from './airports'
import importedData from '../../../../data/airports.json'

// resolveJsonModule gives the data a literal-keyed type; widen it for indexing.
const sharedData = importedData as {
  airports: Airport[]
  checkpointsByAirport: Record<string, string[]>
}

describe('shared airport data (TIR-313: 51-airport expansion)', () => {
  it('has 51 airports with unique codes and complete shape', () => {
    expect(AIRPORTS).toHaveLength(51)
    const codes = new Set(AIRPORTS.map((a) => a.code))
    expect(codes.size).toBe(51)
    for (const a of AIRPORTS) {
      expect(a.id).toMatch(/^apt-[a-z]{3}$/)
      expect(a.code).toMatch(/^[A-Z]{3}$/)
      expect(a.name.length).toBeGreaterThan(0)
      expect(a.city.length).toBeGreaterThan(0)
      expect(a.timezone.length).toBeGreaterThan(0)
    }
  })

  it('includes the launch airports and the expanded set', () => {
    for (const code of ['JFK', 'SEA', 'LAX', 'ORD', 'SFO', 'ATL', 'DEN', 'MIA', 'HNL']) {
      expect(AIRPORTS.some((a) => a.code === code)).toBe(true)
    }
  })

  it('DEFAULT_AIRPORT is SEA by explicit code, never a positional index', () => {
    expect(DEFAULT_AIRPORT.code).toBe('SEA')
    expect(DEFAULT_AIRPORT.id).toBe('apt-sea')
  })

  it('searchAirports finds expanded airports by city, code, and name', () => {
    expect(searchAirports('atlanta').map((a) => a.code)).toEqual(['ATL'])
    expect(searchAirports('MCO').map((a) => a.code)).toEqual(['MCO'])
    expect(searchAirports('honolulu').map((a) => a.code)).toEqual(['HNL'])
    expect(searchAirports('jfk').map((a) => a.code)).toEqual(['JFK'])
    expect(searchAirports('')).toHaveLength(51)
  })

  it('airportById resolves by id and by code', () => {
    expect(airportById('apt-atl')?.code).toBe('ATL')
    expect(airportById('atl')?.code).toBe('ATL')
    expect(airportById('apt-nope')).toBeUndefined()
  })

  it('keeps the shared file internally consistent: every airport has checkpoints', () => {
    for (const a of sharedData.airports) {
      const cps = sharedData.checkpointsByAirport[a.code]
      expect(Array.isArray(cps)).toBe(true)
      expect(cps.length).toBeGreaterThan(0)
      for (const name of cps) expect(name.length).toBeGreaterThan(0)
    }
  })

  it('launch airports keep Main first so existing production reports stay valid', () => {
    for (const code of ['JFK', 'SEA', 'LAX', 'ORD', 'SFO']) {
      expect(sharedData.checkpointsByAirport[code][0]).toBe('Main')
    }
  })

  it('checkpointOptions returns the real checkpoint list for any supported airport', () => {
    const atl = checkpointOptions('ATL')
    expect(atl.length).toBeGreaterThanOrEqual(4)
    expect(atl).toContain('Domestic North Checkpoint A')
    expect(checkpointOptions('JFK')[0]).toBe('Main')
    expect(checkpointOptions('JFK')).toContain('Terminal 4 Security')
  })

  it('checkpointOptions is case-insensitive and trims input', () => {
    expect(checkpointOptions('atl')).toEqual(checkpointOptions('ATL'))
    expect(checkpointOptions(' atl ')).toEqual(checkpointOptions('ATL'))
  })

  it('checkpointOptions never throws and returns [] for unknown airports', () => {
    expect(checkpointOptions('')).toEqual([])
    expect(checkpointOptions('YYY')).toEqual([])
    expect(checkpointOptions(undefined as unknown as string)).toEqual([])
  })
})
