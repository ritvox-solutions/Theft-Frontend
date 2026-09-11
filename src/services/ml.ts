import { api } from './api'

export interface MlStatus {
  status: 'active' | 'untrained'
  loaded: boolean
  model_exists: boolean
  algorithm: string
  last_trained_at: string | null
  file_size_bytes: number | null
  total_windows_available: number
  anomaly_windows_count: number
  features: string[]
}

export interface RetrainResult {
  status: string
  samples_trained?: number
  contamination?: number
  model_path?: string
  features?: string[]
}

export async function getMlStatus(): Promise<MlStatus> {
  const { data } = await api.get<MlStatus>('/api/ml/status')
  return data
}

export async function retrainModel(): Promise<RetrainResult> {
  const { data } = await api.post<RetrainResult>('/api/ml/retrain')
  return data
}
