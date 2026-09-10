import { api, clearToken, setToken } from './api'

export interface CurrentUser {
  id: string
  name: string
  email: string
  role: 'consumer' | 'admin'
}

interface LoginResponse {
  access_token: string
  token_type: string
  role: string
}

export async function login(email: string, password: string): Promise<void> {
  const { data } = await api.post<LoginResponse>('/api/auth/login', { email, password })
  setToken(data.access_token)
}

export async function getMe(): Promise<CurrentUser> {
  const { data } = await api.get<CurrentUser>('/api/auth/me')
  return data
}

export function logout(): void {
  clearToken()
}
