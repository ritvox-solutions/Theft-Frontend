import { api } from './api'
import type { Meter } from './readings'

/** GET /api/meters already returns every meter for an admin JWT (Phase 1 scoping) — no backend change needed. */
export async function getAllMeters(): Promise<Meter[]> {
  const { data } = await api.get<Meter[]>('/api/meters')
  return data
}

export async function getMeter(id: string): Promise<Meter> {
  const { data } = await api.get<Meter>(`/api/meters/${id}`)
  return data
}

export interface CreateMeterPayload {
  meter_code: string
  user_id: string
  device_key: string
  location_label?: string
  status?: 'active' | 'inactive'
}

export async function createMeter(payload: CreateMeterPayload): Promise<Meter> {
  const { data } = await api.post<Meter>('/api/meters', payload)
  return data
}

export interface UpdateMeterPayload {
  meter_code?: string
  location_label?: string
  status?: 'active' | 'inactive'
}

export async function updateMeter(id: string, payload: UpdateMeterPayload): Promise<Meter> {
  const { data } = await api.put<Meter>(`/api/meters/${id}`, payload)
  return data
}

/** Deactivation is a status update, not a delete — keeps the meter's history intact. */
export async function deactivateMeter(id: string): Promise<Meter> {
  return updateMeter(id, { status: 'inactive' })
}

export async function activateMeter(id: string): Promise<Meter> {
  return updateMeter(id, { status: 'active' })
}

export async function deleteMeter(id: string): Promise<void> {
  await api.delete(`/api/meters/${id}`)
}

/** Remote load-disconnect. Independent of active/inactive status — the meter
 * keeps metering; the device applies this on its next reading POST. */
export async function setRelayState(
  id: string,
  state: 'connected' | 'disconnected',
): Promise<Meter> {
  const { data } = await api.patch<Meter>(`/api/meters/${id}/relay`, { state })
  return data
}
