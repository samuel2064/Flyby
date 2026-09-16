export interface Airport {
  id: string
  code: string
  name: string
  city: string
}

export const AIRPORTS: Airport[] = [
  { id: 'apt-jfk', code: 'JFK', name: 'John F. Kennedy International', city: 'New York' },
  { id: 'apt-sea', code: 'SEA', name: 'Seattle-Tacoma International', city: 'Seattle' },
  { id: 'apt-lax', code: 'LAX', name: 'Los Angeles International', city: 'Los Angeles' },
  { id: 'apt-ord', code: 'ORD', name: "O'Hare International", city: 'Chicago' },
  { id: 'apt-sfo', code: 'SFO', name: 'San Francisco International', city: 'San Francisco' },
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
