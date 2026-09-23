export interface Airport {
  id: string
  code: string
  name: string
  city: string
  timezone: string
}

export const AIRPORTS: Airport[] = [
  { id: 'apt-jfk', code: 'JFK', name: 'John F. Kennedy International', city: 'New York', timezone: 'America/New_York' },
  { id: 'apt-sea', code: 'SEA', name: 'Seattle-Tacoma International', city: 'Seattle', timezone: 'America/Los_Angeles' },
  { id: 'apt-lax', code: 'LAX', name: 'Los Angeles International', city: 'Los Angeles', timezone: 'America/Los_Angeles' },
  { id: 'apt-ord', code: 'ORD', name: "O'Hare International", city: 'Chicago', timezone: 'America/Chicago' },
  { id: 'apt-sfo', code: 'SFO', name: 'San Francisco International', city: 'San Francisco', timezone: 'America/Los_Angeles' },
]

export const DEFAULT_AIRPORT = AIRPORTS[1]

export function searchAirports(query: string): Airport[] {
  const q = query.trim().toLowerCase()
  if (!q) return AIRPORTS
  return AIRPORTS.filter(
    (a) =>
      a.code.toLowerCase().includes(q) ||
      a.city.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q),
  )
}

export function airportById(id: string): Airport | undefined {
  return AIRPORTS.find((a) => a.id === id || a.code === id.toUpperCase())
}
