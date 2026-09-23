import { apiFetch } from './client'

// Contract: GET /api/checkpoints/:id/history (docs/API.md). Real reported
// wait times bucketed into fixed intervals over a rolling window - powers the
// per-checkpoint historical chart. No fabrication: a checkpoint without
// reports returns an empty history.

export interface CheckpointHistoryPoint {
  time: string
  minutes: number
  count: number
}

export interface CheckpointHistoryResponse {
  data: {
    checkpointId: string
    airportCode: string
    airportName: string
    name: string
    windowHours: number
    bucketMinutes: number
    reportCount: number
    history: CheckpointHistoryPoint[]
  }
}

export function getCheckpointHistory(
  checkpointId: string,
  windowHours = 4,
  bucketMinutes = 30,
): Promise<CheckpointHistoryResponse> {
  const query = `?window=${windowHours}&bucket=${bucketMinutes}`
  return apiFetch<CheckpointHistoryResponse>(
    `/api/checkpoints/${encodeURIComponent(checkpointId)}/history${query}`,
  )
}
