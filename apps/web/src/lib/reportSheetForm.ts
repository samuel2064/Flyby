export const DEFAULT_PRESET_MINUTES = 15

export interface ReportSheetFormState {
  pickedCheckpoint: string
  minutes: number
  customMinutes: string
  customError: string | null
  submitting: boolean
  submitted: boolean
  error: string | null
  rateLimitUntil: number | null
}

export function freshReportSheetFormState(): ReportSheetFormState {
  return {
    pickedCheckpoint: '',
    minutes: DEFAULT_PRESET_MINUTES,
    customMinutes: '',
    customError: null,
    submitting: false,
    submitted: false,
    error: null,
    rateLimitUntil: null,
  }
}

export function shouldResetReportSheetForm(open: boolean, wasOpen: boolean): boolean {
  return open && !wasOpen
}
