import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TestBrowserRouter } from './testRouter'
import Search from '../src/pages/Search'
import '@testing-library/jest-dom'

const mockAirports = [
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
    code: 'LGA',
    name: 'LaGuardia Airport',
    city: 'New York',
    state: 'NY',
    country: 'USA',
  },
]

function mockFetchOk(data: unknown = mockAirports) {
  vi.spyOn(globalThis, "fetch" as any).mockImplementation(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ data }),
    })
  );
}

describe('Search page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders airport search input', () => {
    render(
      <TestBrowserRouter>
        <Search />
      </TestBrowserRouter>
    )
    expect(screen.getByPlaceholderText(/Airport code/)).toBeInTheDocument()
  })

  it('shows autocomplete results as user types', async () => {
    mockFetchOk([mockAirports[0]])

    render(
      <TestBrowserRouter>
        <Search />
      </TestBrowserRouter>
    )

    fireEvent.change(screen.getByPlaceholderText(/Airport code/), {
      target: { value: 'jfk' },
    })

    // AirportSearch debounces (300ms) then fetches and shows dropdown results
    await waitFor(() => {
      expect(screen.getByText(/John F. Kennedy/)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('shows "Find nearby airports" button', () => {
    render(
      <TestBrowserRouter>
        <Search />
      </TestBrowserRouter>
    )
    expect(screen.getByText(/Find nearby airports/)).toBeDefined()
  })

  it('requests geolocation and shows nearby airports', async () => {
    // Mock navigator.geolocation
    const mockGetCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: { latitude: 40.6413, longitude: -73.7781 } as GeolocationCoordinates,
        timestamp: Date.now(),
      } as GeolocationPosition);
    });

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        geolocation: { getCurrentPosition: mockGetCurrentPosition },
      } as any,
      writable: true,
      configurable: true,
    });

    mockFetchOk();

    render(
      <TestBrowserRouter>
        <Search />
      </TestBrowserRouter>
    )

    fireEvent.click(screen.getByText(/Find nearby airports/));

    await waitFor(() => {
      expect(screen.getByText(/John F. Kennedy/)).toBeDefined();
      expect(screen.getByText(/LaGuardia/)).toBeDefined();
    });

    expect(mockGetCurrentPosition).toHaveBeenCalledOnce();
  })

  it('shows error when geolocation fails', async () => {
    const mockGetCurrentPosition = vi.fn((_success: any, error: PositionErrorCallback) => {
      error?.({
        code: 1,
        message: "User denied Geolocation",
      } as GeolocationPositionError);
    });

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        geolocation: { getCurrentPosition: mockGetCurrentPosition },
      } as any,
      writable: true,
      configurable: true,
    });

    render(
      <TestBrowserRouter>
        <Search />
      </TestBrowserRouter>
    )

    fireEvent.click(screen.getByText(/Find nearby airports/));

    await waitFor(() => {
      expect(screen.getByText(/User denied Geolocation/)).toBeDefined();
    });
  })

  it('nearby results link to airport detail pages', async () => {
    const mockGetCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: { latitude: 40.6413, longitude: -73.7781 } as GeolocationCoordinates,
        timestamp: Date.now(),
      } as GeolocationPosition);
    });

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        geolocation: { getCurrentPosition: mockGetCurrentPosition },
      } as any,
      writable: true,
      configurable: true,
    });

    mockFetchOk();

    render(
      <TestBrowserRouter>
        <Search />
      </TestBrowserRouter>
    )

    fireEvent.click(screen.getByText(/Find nearby airports/));

    await waitFor(() => {
      expect(screen.getByText(/LaGuardia/)).toBeDefined();
    });

    const link = screen.getByRole('link', { name: /John F. Kennedy/ });
    expect(link).toHaveAttribute('href', '/airport/jfk');
  })
})
