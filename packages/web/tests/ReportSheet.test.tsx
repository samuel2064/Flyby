import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReportSheet } from '../src/components/ReportSheet'

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.restoreAllMocks()
  globalThis.fetch = vi.fn()
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('ReportSheet (checkpoint picker / first-report flow)', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<ReportSheet open={false} airportCode="JFK" onClose={() => {}} onReported={() => {}} />)
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('shows the checkpoint picker when no fixed checkpoint is given', () => {
    render(<ReportSheet open={true} airportCode="JFK" onClose={() => {}} onReported={() => {}} />)
    expect(screen.getByTestId('checkpoint-picker')).toBeInTheDocument()
    expect(screen.getByText('Report wait time')).toBeInTheDocument()
    expect(screen.getByText('JFK · Main')).toBeInTheDocument()
  })

  it('does not show the checkpoint picker when a fixed checkpoint is given', () => {
    render(<ReportSheet open={true} airportCode="JFK" checkpoint="Terminal 4 Security" onClose={() => {}} onReported={() => {}} />)
    expect(screen.queryByTestId('checkpoint-picker')).toBeNull()
    expect(screen.getByText('JFK · Terminal 4 Security')).toBeInTheDocument()
  })

  it('disables submit when no checkpoint is available', () => {
    render(<ReportSheet open={true} airportCode="ZZZ" onClose={() => {}} onReported={() => {}} />)
    const button = screen.getByRole('button', { name: /Pick a checkpoint first/i })
    expect(button).toBeDisabled()
  })

  it('submits a report and calls onReported', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => Promise.resolve({ id: 'rep-1', airport: 'JFK', checkpoint: 'Main', waitMinutes: 15, receivedAt: '2026-09-23T12:00:00Z' }),
    } as Response)

    const onReported = vi.fn()
    render(<ReportSheet open={true} airportCode="JFK" onClose={() => {}} onReported={onReported} />)

    // Select a wait time
    fireEvent.click(screen.getByRole('radio', { name: /^15$/ }))
    // Submit
    fireEvent.click(screen.getByRole('button', { name: /Submit report/i }))

    await waitFor(() => {
      expect(onReported).toHaveBeenCalled()
    })

    expect(fetch).toHaveBeenCalledWith('/api/wait-times/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ airport: 'JFK', checkpoint: 'Main', waitMinutes: 15 }),
    })
  })

  it('shows the submitted confirmation after reporting', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => Promise.resolve({ id: 'rep-1', airport: 'JFK', checkpoint: 'Main', waitMinutes: 15, receivedAt: '2026-09-23T12:00:00Z' }),
    } as Response)

    render(<ReportSheet open={true} airportCode="JFK" onClose={() => {}} onReported={() => {}} />)

    fireEvent.click(screen.getByRole('radio', { name: /^15$/ }))
    fireEvent.click(screen.getByRole('button', { name: /Submit report/i }))

    await waitFor(() => {
      expect(screen.getByText(/Thanks! Your report is live./)).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByText(/Thanks! Your report is live./)).toHaveAttribute('role', 'status')
    })
  })

  it('labels the "60" preset as 60 not 60+', () => {
    render(<ReportSheet open={true} airportCode="JFK" onClose={() => {}} onReported={() => {}} />)
    expect(screen.getByRole('radio', { name: /^60$/ })).toBeInTheDocument()
  })

  it('validates custom minutes range and shows inline error', () => {
    render(<ReportSheet open={true} airportCode="JFK" onClose={() => {}} onReported={() => {}} />)
    fireEvent.click(screen.getByRole('radio', { name: /Custom/i }))
    const input = screen.getByLabelText(/Custom wait time in minutes/i)
    fireEvent.change(input, { target: { value: '999' } })
    expect(screen.getByText(/Enter 1–120 minutes/)).toBeInTheDocument()
  })

  it('announces lane options as a radiogroup', () => {
    render(<ReportSheet open={true} airportCode="JFK" onClose={() => {}} onReported={() => {}} />)
    expect(screen.getByRole('radiogroup', { name: /Security lane/i })).toBeInTheDocument()
  })

  it('renders presets up to 120 minutes', () => {
    render(<ReportSheet open={true} airportCode="JFK" onClose={() => {}} onReported={() => {}} />)
    expect(screen.getByRole('radio', { name: /^90$/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /^120$/ })).toBeInTheDocument()
  })

  it('resets form state when reopened after a prior report', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () => Promise.resolve({ id: 'rep-1', airport: 'JFK', checkpoint: 'Main', waitMinutes: 15, receivedAt: '2026-09-23T12:00:00Z' }),
    } as Response)

    const { rerender } = render(<ReportSheet open={true} airportCode="JFK" onClose={() => {}} onReported={() => {}} />)

    // Select a non-default preset
    fireEvent.click(screen.getByRole('radio', { name: /^120$/ }))

    // Toggle closed then open via prop; form should reset to default preset 15.
    rerender(<ReportSheet open={false} airportCode="JFK" onClose={() => {}} onReported={() => {}} />)
    rerender(<ReportSheet open={true} airportCode="JFK" onClose={() => {}} onReported={() => {}} />)

    expect(screen.getByRole('radio', { name: /^15$/ })).toHaveAttribute('aria-checked', 'true')
  })
})
