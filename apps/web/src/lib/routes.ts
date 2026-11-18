export type AppView = 'dashboard' | 'search' | 'airport'

export interface RouteMatch {
  view: AppView
  airportCode?: string
}

const AIRPORT_ROUTE = /^\/airports?\/([A-Za-z0-9]+)\/?$/

export function parseRoute(pathname: string): RouteMatch {
  const path = pathname.trim() || '/'
  if (path === '/search' || path === '/search/') return { view: 'search' }
  const airport = AIRPORT_ROUTE.exec(path)
  if (airport) return { view: 'airport', airportCode: airport[1].toUpperCase() }
  return { view: 'dashboard' }
}
