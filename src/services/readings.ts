import { api } from './api'

export interface Meter {
  id: string
  meter_code: string
  user_id: string
  device_key: string
  location_label: string | null
  status: 'active' | 'inactive'
  relay_state: 'connected' | 'disconnected'
  relay_updated_at: string | null
  created_at: string
}

export interface Reading {
  id: string
  meter_id: string
  voltage: number
  current: number
  source_current?: number | null
  delta_current?: number | null
  theft_detected?: boolean
  power: number
  frequency: number | null
  power_factor: number | null
  recorded_at: string
  created_at: string
}

export interface GetReadingsParams {
  start?: string
  end?: string
  limit?: number
}

export async function getReadings(
  meterId: string,
  params: GetReadingsParams = {},
): Promise<Reading[]> {
  const { data } = await api.get<Reading[]>(`/api/readings/${meterId}`, { params })
  return data
}

/** A consumer has exactly one meter per the current seed data — returns the first. */
export async function getMyMeter(): Promise<Meter | null> {
  const { data } = await api.get<Meter[]>('/api/meters')
  return data[0] ?? null
}
