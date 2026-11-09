import { useEffect, useRef, useState } from 'react'
import { searchAirports } from '../data/airports'

interface AirportSelectorProps {
  airport: { code: string; name: string }
  onChange: (selectedAirport: { code: string; name: string }) => void
  isLoading?: boolean
  disabled?: boolean
  recentAirports?: Array<{ code: string; name: string }>
  searchPlaceholder?: string
}

export function AirportSelector({
  airport,
  onChange,
  isLoading = false,
  disabled = false,
  recentAirports,
  searchPlaceholder = 'Search airports...',
}: AirportSelectorProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const allAirports = searchAirports('').map((a) => ({ code: a.code, name: a.name }))

  const results = allAirports.filter(
    (a) =>
      a.code.toLowerCase().includes(query.toLowerCase()) ||
      a.name.toLowerCase().includes(query.toLowerCase()),
  )

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function select(a: { code: string; name: string }) {
    onChange(a)
    setQuery('')
    setOpen(false)
  }

  if (disabled || isLoading) {
    return (
      <div className="relative flex items-center space-x-3 opacity-50 pointer-events-none">
        <span className="text-lg font-semibold">{airport.code}</span>
        <span className="text-base text-gray-600 dark:text-gray-300">{airport.name}</span>
        <svg
          aria-hidden="true"
          className="ml-2 h-4 w-4 text-gray-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex items-center space-x-3 cursor-pointer hover:bg-brand-50 rounded-lg px-3 py-2 transition"
        onClick={() => setOpen(!open)}
      >
        <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">{airport.code}</span>
        <span className="text-base text-gray-600 dark:text-gray-300">{airport.name}</span>
        <svg
          aria-hidden="true"
          className={`ml-2 h-4 w-4 transition-transform ${open ? 'rotate-180' : ''} text-gray-400`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {open && (
        <div className="absolute z-50 mt-2 w-64 bg-white dark:bg-slate-800 rounded-lg shadow-lg py-1 border border-slate-200 dark:border-slate-600">
          <div className="px-4 py-2">
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          {recentAirports && recentAirports.length > 0 && (
            <div className="px-4 py-1 border-b border-slate-100 dark:border-slate-700">
              <p className="px-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Recent</p>
              <div className="space-y-1">
                {recentAirports.map((a) => (
                  <button
                    key={a.code}
                    type="button"
                    onClick={() => select(a)}
                    className="flex w-full items-center px-3 py-2 text-sm hover:bg-brand-50/50 rounded"
                  >
                    <span className="font-semibold text-brand-700">{a.code}</span>
                    <span className="ml-2 text-gray-600 dark:text-gray-300">{a.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <ul className="max-h-60 overflow-y-auto">
            {results.map((a) => (
              <button
                key={a.code}
                type="button"
                onClick={() => select(a)}
                className={`flex w-full items-center px-4 py-2 text-sm ${a.code === airport.code ? 'font-medium' : ''} hover:bg-brand-50/50`}
              >
                <span className="font-semibold text-brand-700">{a.code}</span>
                <span className="ml-2 text-gray-600 dark:text-gray-300">{a.name}</span>
              </button>
            ))}
            {results.length === 0 && (
              <li className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">No airports found</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
