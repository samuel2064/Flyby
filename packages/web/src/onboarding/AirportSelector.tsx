import { useState } from 'react'
import type { AirportSelectorProps } from './types'

const POPULAR_AIRPORTS = [
  { code: 'JFK', name: 'John F. Kennedy International', city: 'New York' },
  { code: 'LAX', name: 'Los Angeles International', city: 'Los Angeles' },
  { code: 'ORD', name: "O'Hare International", city: 'Chicago' },
  { code: 'ATL', name: 'Hartsfield-Jackson Atlanta International', city: 'Atlanta' },
  { code: 'DFW', name: 'Dallas/Fort Worth International', city: 'Dallas' },
  { code: 'DEN', name: 'Denver International', city: 'Denver' },
]

export default function AirportSelector({
  onSelect,
  onSkip,
  preselected,
}: AirportSelectorProps) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(preselected || null)

  const results = query
    ? POPULAR_AIRPORTS.filter((a) =>
        [a.code, a.name, a.city].some((s) =>
          s.toLowerCase().includes(query.toLowerCase())
        )
      )
    : POPULAR_AIRPORTS

  const handleChipSelect = (code: string) => {
    setSelected(code)
  }

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value)
  }

  const handleResultSelect = (code: string) => {
    setSelected(code)
  }

  const handleConfirm = () => {
    if (selected) {
      onSelect(selected)
    }
  }

  return (
    <section className="w-full max-w-xl space-y-6">
      <div className="flex items-center justify-between w-full">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          {preselected ? 'Use {nearest airport}' : 'Pick your airport'}
        </h2>
        <button
          type="button"
          onClick={onSkip}
          className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 min-h-[44px] min-w-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
          aria-label="Skip airport selection"
        >
          ×
        </button>
      </div>
      <p className="text-slate-600 dark:text-slate-300 max-w-lg mx-auto">
        We'll show wait times for your checkpoints and let you report in 10 seconds.
      </p>

      <div className="flex flex-wrap gap-2 w-full justify-center">
        {POPULAR_AIRPORTS.map((airport) => {
          const isPressed = selected === airport.code
          return (
            <button
              key={airport.code}
              type="button"
              onClick={() => handleChipSelect(airport.code)}
              aria-pressed={isPressed}
              aria-label={`${airport.code} ${airport.name}, ${airport.city}${isPressed ? ', selected' : 'not selected'}`}
              className={`min-h-[48px] min-w-[48px] px-4 py-2 rounded-xl text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 ${isPressed ? 'bg-brand-600 text-white focus-visible:ring-brand-600' : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus-visible:ring-slate-500'}`}
            >
              {airport.code}
            </button>
          )
        })}
      </div>

      <div className="w-full">
        <input
          type="text"
          autoCapitalize="characters"
          placeholder="Search by code or city"
          value={query}
          onChange={handleSearchChange}
          aria-label="Search airports by code or city"
          className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl h-12 px-4 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent min-h-[48px]"
        />
      </div>

      <div className="flex-1 overflow-y-auto w-full max-h-64">
        {results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-slate-600 dark:text-slate-300 mb-4">
              Try a different city or code
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setSelected(null)
              }}
              className="text-sm text-brand-600 dark:text-brand-500 underline min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              Retry
            </button>
          </div>
        ) : (
          <ul className="space-y-0" role="listbox">
            {results.map((airport) => {
              const isSelected = selected === airport.code
              return (
                <li
                  key={airport.code}
                  role="option"
                  aria-selected={isSelected}
                  aria-label={`${airport.code} ${airport.name}, ${airport.city} — ${isSelected ? 'selected' : 'not selected'}`}
                  onClick={() => handleResultSelect(airport.code)}
                  className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors min-h-[56px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${isSelected ? 'bg-brand-50 dark:bg-brand-900/20 ring-2 ring-brand-500' : ''}`}
                >
                  <div>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{airport.code}</span>
                    <span className="ml-2 text-sm text-slate-600 dark:text-slate-300">{airport.name}</span>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{airport.city}</p>
                  </div>
                  {isSelected && (
                    <svg className="w-5 h-5 text-brand-600" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </li>
          )
        })}  
          </ul>
        )}
      </div>

      <div className="pt-6">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!selected}
          aria-label={`Select ${selected || 'airport'}`}
          className={`w-full bg-gradient-to-r from-brand-600 to-brand-700 text-white px-8 py-4 rounded-xl font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 min-h-[48px]`}
        >
          {selected ? `Select ${selected}` : 'Select Airport'}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="mt-3 w-full text-sm text-slate-500 dark:text-slate-400 underline hover:no-underline px-8 py-2 rounded-xl min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
          aria-label="Skip airport selection"
        >
          Skip
        </button>
      </div>
    </section>
  )
}
