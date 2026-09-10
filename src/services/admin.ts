import { api } from './api'

export interface AdminStats {
  energy_today_kwh: number
}

export async function getAdminStats(): Promise<AdminStats> {
  const { data } = await api.get<AdminStats>('/api/admin/stats')
  return data
}
