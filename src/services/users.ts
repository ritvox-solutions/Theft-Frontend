import { api } from './api'

export interface UserSummary {
  id: string
  name: string
  email: string
  role: 'consumer' | 'admin'
}

export async function getUsers(params: { role?: 'consumer' | 'admin' } = {}): Promise<UserSummary[]> {
  const { data } = await api.get<UserSummary[]>('/api/users', { params })
  return data
}
