import { api } from './api'

export type AnomalyStatus = 'open' | 'reviewed' | 'confirmed_theft' | 'false_positive'

export interface ReadingWindowSummary {
  window_start: string
  window_end: string
  avg_voltage: number
  avg_current: number
  avg_power: number
}

export interface Anomaly {
  id: string
  reading_window_id: string
  meter_id: string
  meter_code: string
  consumer_name: string
  anomaly_score: number
  status: AnomalyStatus
  detected_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  notes: string | null
  reading_window: ReadingWindowSummary
}

export async function getAnomalies(params: { status?: AnomalyStatus } = {}): Promise<Anomaly[]> {
  const { data } = await api.get<Anomaly[]>('/api/anomalies', { params })
  return data
}

export async function updateAnomalyStatus(
  id: string,
  payload: { status: Exclude<AnomalyStatus, 'open'>; notes?: string },
): Promise<Anomaly> {
  const { data } = await api.patch<Anomaly>(`/api/anomalies/${id}/status`, payload)
  return data
}
