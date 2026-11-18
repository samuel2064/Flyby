import { describe, expect, it } from 'vitest'
import { parseRoute } from './routes'

describe('parseRoute', () => {
  it('maps the root path to the dashboard', () => {
    expect(parseRoute('/')).toEqual({ view: 'dashboard' })
    expect(parseRoute('')).toEqual({ view: 'dashboard' })
  })

  it('maps the search path to the search view', () => {
    expect(parseRoute('/search')).toEqual({ view: 'search' })
    expect(parseRoute('/search/')).toEqual({ view: 'search' })
  })

  it('maps the singular airport path to the airport view', () => {
    expect(parseRoute('/airport/JFK')).toEqual({ view: 'airport', airportCode: 'JFK' })
  })

  it('accepts the plural airport path so shared /airports/JFK links work', () => {
    expect(parseRoute('/airports/JFK')).toEqual({ view: 'airport', airportCode: 'JFK' })
    expect(parseRoute('/airports/JFK/')).toEqual({ view: 'airport', airportCode: 'JFK' })
  })

  it('uppercases the airport code', () => {
    expect(parseRoute('/airports/jfk')).toEqual({ view: 'airport', airportCode: 'JFK' })
  })

  it('falls back to the dashboard for unknown paths', () => {
    expect(parseRoute('/nope')).toEqual({ view: 'dashboard' })
    expect(parseRoute('/airports/')).toEqual({ view: 'dashboard' })
  })
})
