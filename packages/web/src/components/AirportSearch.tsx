import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { useDebounce } from "../hooks/useDebounce";

export interface AirportResult {
  id: string;
  code: string;
  name: string;
  city: string;
  state: string | null;
  country: string;
  distance?: number;
}

export interface AirportSearchProps {
  onSelect?: (airport: AirportResult) => void;
  placeholder?: string;
  debounceMs?: number;
  minQueryLength?: number;
  showDistance?: boolean;
  className?: string;
  autoFocus?: boolean;
}

export function AirportSearch({
  onSelect,
  placeholder = "Search airport by code, name, or city...",
  debounceMs = 300,
  minQueryLength = 2,
  showDistance = false,
  className = "",
  autoFocus = false,
}: AirportSearchProps) {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [manualSearch, setManualSearch] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const debouncedQuery = useDebounce(query, debounceMs);

  const searchUrl =
    debouncedQuery.length >= minQueryLength || manualSearch
      ? `/api/airports/search?q=${encodeURIComponent(submittedQuery || debouncedQuery)}`
      : null;

  const { data: results, loading, error } = useApi<AirportResult[]>(searchUrl, [searchUrl]);

  const filteredResults = useMemo(() => {
    if (!results) return [];
    if (!query.trim()) return results;
    const lowerQuery = query.toLowerCase();
    return results.filter(
      (a) =>
        a.code.toLowerCase().includes(lowerQuery) ||
        a.name.toLowerCase().includes(lowerQuery) ||
        a.city.toLowerCase().includes(lowerQuery)
    );
  }, [results, query]);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    setIsOpen(value.length >= minQueryLength);
    setSelectedIndex(-1);
    if (value.length < minQueryLength) {
      setSubmittedQuery("");
      setManualSearch(false);
    }
  }, [minQueryLength]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (query.length < minQueryLength) return;
      setSubmittedQuery(query);
      setManualSearch(true);
      setIsOpen(false);
    },
    [query, minQueryLength]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const maxIndex = filteredResults.length - 1;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          if (maxIndex >= 0) {
            setSelectedIndex((prev) => (prev < maxIndex ? prev + 1 : 0));
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          if (maxIndex >= 0) {
            setSelectedIndex((prev) => (prev > 0 ? prev - 1 : maxIndex));
          }
          break;
        case "Enter":
          if (selectedIndex >= 0 && filteredResults[selectedIndex]) {
            e.preventDefault();
            const selected = filteredResults[selectedIndex];
            onSelect?.(selected);
            setIsOpen(false);
            setSelectedIndex(-1);
            if (inputRef.current) inputRef.current.blur();
          }
          break;
        case "Escape":
          setIsOpen(false);
          setSelectedIndex(-1);
          if (inputRef.current) inputRef.current.blur();
          break;
      }
    }, [filteredResults, selectedIndex, onSelect]);

  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[selectedIndex] as HTMLElement;
      if (item && typeof item.scrollIntoView === 'function') {
        item.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        inputRef.current &&
        !inputRef.current.contains(event.target as Node) &&
        listRef.current &&
        !listRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleResultClick = useCallback(
    (airport: AirportResult) => {
      onSelect?.(airport);
      setIsOpen(false);
      setSelectedIndex(-1);
      if (inputRef.current) inputRef.current.blur();
    },
    [onSelect]
  );

  return (
    <div className="relative">
      <form onSubmit={handleSubmit} className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (query.length >= minQueryLength) setIsOpen(true);
          }}
          placeholder={placeholder}
          autoComplete="off"
          autoFocus={autoFocus}
          aria-autocomplete="list"
          aria-controls="airport-search-results"
          aria-expanded={isOpen && filteredResults.length > 0}
          className={`w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-brand transition ${className}`}
        />
        {isOpen && filteredResults.length > 0 && (
          <ul
            ref={listRef}
            id="airport-search-results"
            role="listbox"
            aria-label="Airport search results"
            className="absolute z-10 w-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden max-h-96 overflow-y-auto"
          >
            {filteredResults.map((airport, index) => (
              <li
                key={airport.id}
                role="option"
                aria-selected={index === selectedIndex}
                onClick={() => handleResultClick(airport)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`px-4 py-2 cursor-pointer transition ${
                  index === selectedIndex ? "bg-brand/10" : "hover:bg-gray-50"
                }`}
              >
                <Link
                  to={`/airport/${airport.code.toLowerCase()}`}
                  onClick={(e) => {
                    e.preventDefault();
                    handleResultClick(airport);
                  }}
                  className="flex items-center justify-between w-full"
                >
                  <div>
                    <p className="font-semibold text-gray-900">
                      {airport.name}{" "}
                      <span className="text-gray-500 font-normal">({airport.code})</span>
                    </p>
                    <p className="text-sm text-gray-500">
                      {airport.city}{airport.state ? `, ${airport.state}` : ""} — {airport.country}
                    </p>
                    {showDistance &&
                      airport.distance !== undefined && (
                        <p className="text-xs text-gray-400">
                          {airport.distance.toFixed(1)} miles away
                        </p>
                      )}
                  </div>
                  <span
                    className="text-xs px-2 py-0.5 bg-brand/10 text-brand rounded font-mono"
                  >
                    {airport.code}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {(isOpen || loading) && filteredResults.length === 0 && query.length >= minQueryLength && (
          <div className="absolute z-10 w-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 p-4 text-center">
            {loading ? (
              <p className="text-gray-500">Searching...</p>
            ) : (
              <p className="text-gray-500">No airports found.</p>
            )}
          </div>
        )}
        {error && (
          <p className="text-red-600 text-sm mt-1" role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}

export default AirportSearch;