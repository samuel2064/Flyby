import { createContext, useContext, useCallback, useState, useMemo, ReactNode } from 'react'
import { ReportSheet } from '../components/ReportSheet'

interface ReportSheetContextValue {
  open: boolean
  airportCode: string
  checkpoint: string | undefined
  openReportSheet: (airportCode: string, checkpoint?: string) => void
  closeReportSheet: () => void
  setReportedHandler: (handler: () => void) => void
}

const ReportSheetContext = createContext<ReportSheetContextValue>({
  open: false,
  airportCode: '',
  checkpoint: undefined,
  openReportSheet: () => {},
  closeReportSheet: () => {},
  setReportedHandler: () => {},
})

export function ReportSheetProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [airportCode, setAirportCode] = useState('')
  const [checkpoint, setCheckpoint] = useState<string | undefined>()
  const [reportedHandler, setReportedHandlerState] = useState<() => void>(() => {})

  const openReportSheet = useCallback((code: string, cp?: string) => {
    setAirportCode(code)
    setCheckpoint(cp)
    setOpen(true)
  }, [])

  const closeReportSheet = useCallback(() => setOpen(false), [])

  const setReportedHandler = useCallback(setReportedHandlerState, [])

  const value = useMemo(
    () => ({ open, airportCode, checkpoint, openReportSheet, closeReportSheet, setReportedHandler }),
    [open, airportCode, checkpoint, openReportSheet, closeReportSheet, setReportedHandler],
  )

  return (
    <ReportSheetContext.Provider value={value}>
      {children}
      <ReportSheet
        open={open}
        airportCode={airportCode}
        checkpoint={checkpoint}
        onClose={closeReportSheet}
        onReported={reportedHandler}
      />
    </ReportSheetContext.Provider>
  )
}

export function useReportSheet() {
  return useContext(ReportSheetContext)
}
