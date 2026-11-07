import { apiFetch } from './client'
import type { ReportConfirmation, ReportSubmission } from './types'

export function submitWaitTimeReport(report: ReportSubmission): Promise<ReportConfirmation> {
  return apiFetch<ReportConfirmation>('/api/wait-times/report', {
    method: 'POST',
    body: JSON.stringify(report),
  })
}
