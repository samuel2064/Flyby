import { useEffect, useRef, useState } from 'react'
import { searchAirports, type Airport } from '../data/airports'

interface AirportSearchProps {
  selected: Airport
  onSelect: (airport: Airport) => void
}

export function AirportSearch({ selected, onSelect }: AirportSearchProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const results = searchAirports(query)

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function choose(airport: Airport) {
    onSelect(airport)
    setQuery('')
    setOpen(false)
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter')) {
      setOpen(true)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((i) => (i + 1) % results.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((i) => (i - 1 + results.length) % results.length)
    } else if (event.key === 'Enter' && open && results[activeIndex]) {
      event.preventDefault()
      choose(results[activeIndex])
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative w-full sm:max-w-sm">
      <label htmlFor="airport-search" className="sr-only">
        Search airports
      </label>
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
        <svg
          aria-hidden="true"
          className="h-5 w-5 text-slate-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
      </div>
      <input
        id="airport-search"
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls="airport-search-results"
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={`Search airports (current: ${selected.code})`}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setActiveIndex(0)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-4 text-base shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
      />
      {open && results.length > 0 && (
        <ul
          id="airport-search-results"
          role="listbox"
          aria-label="Airports"
          className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {results.map((airport, index) => (
            <li key={airport.id} role="option" aria-selected={airport.id === selected.id}>
              <button
                type="button"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(airport)}
                className={`flex h-12 w-full items-center justify-between px-4 text-left text-base ${
                  index === activeIndex ? 'bg-brand-50' : 'bg-white'
                }`}
              >
                <span>
                  <span className="font-semibold text-brand-700">{airport.code}</span>{' '}
                  <span className="text-slate-700">{airport.city}</span>
                </span>
                <span className="hidden text-xs text-slate-400 sm:inline">{airport.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
