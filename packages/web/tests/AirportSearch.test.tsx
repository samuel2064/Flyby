import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TestBrowserRouter } from './testRouter'
import { AirportSearch, AirportResult } from '../src/components/AirportSearch'
import '@testing-library/jest-dom'

const mockAirports: AirportResult[] = [
  {
    id: '1',
    code: 'JFK',
    name: 'John F. Kennedy International Airport',
    city: 'New York',
    state: 'NY',
    country: 'USA',
  },
  {
    id: '2',
    code: 'LAX',
    name: 'Los Angeles International Airport',
    city: 'Los Angeles',
    state: 'CA',
    country: 'USA',
  },
  {
    id: '3',
    code: 'ORD',
    name: "O'Hare International Airport",
    city: 'Chicago',
    state: 'IL',
    country: 'USA',
  },
]

describe('AirportSearch component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  })

  afterEach(() => {
    vi.resetAllMocks();
  })

  it('renders search input with placeholder', () => {
    render(
      <TestBrowserRouter>
        <AirportSearch />
      </TestBrowserRouter>
    )
    expect(screen.getByPlaceholderText(/Search airport by code, name, or city/)).toBeInTheDocument()
  })

  it('renders with custom placeholder', () => {
    render(
      <TestBrowserRouter>
        <AirportSearch placeholder="Custom search..." />
      </TestBrowserRouter>
    )
    expect(screen.getByPlaceholderText('Custom search...')).toBeInTheDocument()
  })

  it('shows loading state when searching', async () => {
    let resolveFetch: (value: any) => void
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve
    })

    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() => fetchPromise)

    render(
      <TestBrowserRouter>
        <AirportSearch />
      </TestBrowserRouter>
    )

    fireEvent.change(screen.getByPlaceholderText(/Search airport/), {
      target: { value: 'jfk' },
    })

    await waitFor(() => {
      expect(screen.getByText('Searching...')).toBeInTheDocument()
    })

    resolveFetch!({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ data: mockAirports }),
    })

    await waitFor(() => {
      expect(screen.getByText(/John F. Kennedy/)).toBeInTheDocument()
    })
  })

  it('displays search results with airport name, code, city, and country', async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ data: mockAirports }),
      })
    )

    render(
      <TestBrowserRouter>
        <AirportSearch />
      </TestBrowserRouter>
    )

    fireEvent.change(screen.getByPlaceholderText(/Search airport/), {
      target: { value: 'jfk' },
    })

    await waitFor(() => {
      expect(screen.getByText(/John F. Kennedy/)).toBeInTheDocument()
      // Check for code in the specific location (the badge)
      const codeElements = screen.getAllByText(/JFK/)
      expect(codeElements.length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText(/New York/)).toBeInTheDocument()
      expect(screen.getByText(/USA/)).toBeInTheDocument()
    })
  })

  it('submits on form submit', async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ data: mockAirports }),
      })
    )

    render(
      <TestBrowserRouter>
        <AirportSearch />
      </TestBrowserRouter>
    )

    fireEvent.change(screen.getByPlaceholderText(/Search airport/), {
      target: { value: 'lax' },
    })

    // Submit using Enter key on the input
    fireEvent.keyDown(screen.getByPlaceholderText(/Search airport/), { key: 'Enter' })

    await waitFor(() => {
      expect(screen.getByText(/Los Angeles International Airport/)).toBeInTheDocument()
    })
  })

  it('filters results as user types', async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ data: mockAirports }),
      })
    )

    render(
      <TestBrowserRouter>
        <AirportSearch />
      </TestBrowserRouter>
    )

    fireEvent.change(screen.getByPlaceholderText(/Search airport/), {
      target: { value: 'jfk' },
    })

    await waitFor(() => {
      expect(screen.getByText(/John F. Kennedy/)).toBeInTheDocument()
    })

    // Filter further - use a query that matches the airport name
    fireEvent.change(screen.getByPlaceholderText(/Search airport/), {
      target: { value: 'kennedy' },
    })

    await waitFor(() => {
      expect(screen.getByText(/John F. Kennedy/)).toBeInTheDocument()
      // LAX and ORD should not appear since they don't match
      expect(screen.queryByText(/Los Angeles/)).not.toBeInTheDocument()
      expect(screen.queryByText(/Chicago/)).not.toBeInTheDocument()
    })
  })

  it('navigates results with keyboard', async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ data: mockAirports }),
      })
    )

    render(
      <TestBrowserRouter>
        <AirportSearch />
      </TestBrowserRouter>
    )

    fireEvent.change(screen.getByPlaceholderText(/Search airport/), {
      target: { value: 'airport' },
    })

    await waitFor(() => {
      expect(screen.getByText(/John F. Kennedy/)).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText(/Search airport/)

    // Navigate down
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    await waitFor(() => {
      const selectedItem = screen.getAllByRole('option')[0]
      expect(selectedItem).toHaveAttribute('aria-selected', 'true')
    })

    // Navigate down again
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    await waitFor(() => {
      const selectedItem = screen.getAllByRole('option')[1]
      expect(selectedItem).toHaveAttribute('aria-selected', 'true')
    })

    // Navigate up
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    await waitFor(() => {
      const selectedItem = screen.getAllByRole('option')[0]
      expect(selectedItem).toHaveAttribute('aria-selected', 'true')
    })
  })

  it('selects result on Enter key', async () => {
    const onSelect = vi.fn()
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ data: mockAirports }),
      })
    )

    render(
      <TestBrowserRouter>
        <AirportSearch onSelect={onSelect} />
      </TestBrowserRouter>
    )

    fireEvent.change(screen.getByPlaceholderText(/Search airport/), {
      target: { value: 'jfk' },
    })

    await waitFor(() => {
      expect(screen.getByText(/John F. Kennedy/)).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText(/Search airport/)
    // First select an item with keyboard
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    await waitFor(() => {
      const selectedItem = screen.getAllByRole('option')[0]
      expect(selectedItem).toHaveAttribute('aria-selected', 'true')
    })
    // Then press Enter to select
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(mockAirports[0])
    })
  })

  it('closes dropdown on Escape key', async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ data: mockAirports }),
      })
    )

    render(
      <TestBrowserRouter>
        <AirportSearch />
      </TestBrowserRouter>
    )

    fireEvent.change(screen.getByPlaceholderText(/Search airport/), {
      target: { value: 'jfk' },
    })

    await waitFor(() => {
      expect(screen.getByText(/John F. Kennedy/)).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText(/Search airport/)
    fireEvent.keyDown(input, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByText(/John F. Kennedy/)).not.toBeInTheDocument()
    })
  })

  it('calls onSelect when clicking a result', async () => {
    const onSelect = vi.fn()
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ data: mockAirports }),
      })
    )

    render(
      <TestBrowserRouter>
        <AirportSearch onSelect={onSelect} />
      </TestBrowserRouter>
    )

    fireEvent.change(screen.getByPlaceholderText(/Search airport/), {
      target: { value: 'jfk' },
    })

    await waitFor(() => {
      expect(screen.getByText(/John F. Kennedy/)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText(/John F. Kennedy/))

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(mockAirports[0])
    })
  })

  it('closes dropdown when clicking outside', async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ data: mockAirports }),
      })
    )

    render(
      <TestBrowserRouter>
        <AirportSearch />
      </TestBrowserRouter>
    )

    fireEvent.change(screen.getByPlaceholderText(/Search airport/), {
      target: { value: 'jfk' },
    })

    await waitFor(() => {
      expect(screen.getByText(/John F. Kennedy/)).toBeInTheDocument()
    })

    // Click outside the dropdown
    fireEvent.mouseDown(document.body)

    await waitFor(() => {
      expect(screen.queryByText(/John F. Kennedy/)).not.toBeInTheDocument()
    })
  })

  it('shows error message on fetch error', async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })
    )

    render(
      <TestBrowserRouter>
        <AirportSearch />
      </TestBrowserRouter>
    )

    fireEvent.change(screen.getByPlaceholderText(/Search airport/), {
      target: { value: 'jfk' },
    })

    await waitFor(() => {
      expect(screen.getByText(/HTTP 500/)).toBeInTheDocument()
    })
  })

  it('does not search when query is too short', () => {
    render(
      <TestBrowserRouter>
        <AirportSearch minQueryLength={3} />
      </TestBrowserRouter>
    )

    fireEvent.change(screen.getByPlaceholderText(/Search airport/), {
      target: { value: 'jf' },
    })

    // Should not show dropdown for queries shorter than minQueryLength
    expect(screen.queryByText(/Searching/)).not.toBeInTheDocument()
  })

  it('renders with custom className on input', () => {
    render(
      <TestBrowserRouter>
        <AirportSearch className="custom-class" />
      </TestBrowserRouter>
    )
    expect(screen.getByPlaceholderText(/Search airport/)).toHaveClass('custom-class')
  })

  it('shows distance when showDistance is true and data has distance', async () => {
    const airportsWithDistance: AirportResult[] = [
      {
        ...mockAirports[0],
        distance: 5.5,
      },
    ]

    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ data: airportsWithDistance }),
      })
    )

    render(
      <TestBrowserRouter>
        <AirportSearch showDistance={true} />
      </TestBrowserRouter>
    )

    fireEvent.change(screen.getByPlaceholderText(/Search airport/), {
      target: { value: 'jfk' },
    })

    await waitFor(() => {
      expect(screen.getByText(/5\.5 miles away/)).toBeInTheDocument()
    })
  })

  it('links to airport detail page', async () => {
    vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ data: mockAirports }),
      })
    )

    render(
      <TestBrowserRouter>
        <AirportSearch />
      </TestBrowserRouter>
    )

    fireEvent.change(screen.getByPlaceholderText(/Search airport/), {
      target: { value: 'jfk' },
    })

    await waitFor(() => {
      expect(screen.getByText(/John F. Kennedy/)).toBeInTheDocument()
    })

    const link = screen.getByRole('link', { name: /John F. Kennedy/ })
    expect(link).toHaveAttribute('href', '/airport/jfk')
  })
})