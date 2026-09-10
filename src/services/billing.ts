import { api } from './api'

export type BillStatus = 'generated' | 'viewed' | 'paid'

export interface Bill {
  id: string
  meter_id: string
  meter_code: string
  consumer_name: string
  cycle_start: string
  cycle_end: string
  units_consumed_kwh: number
  amount: number
  status: BillStatus
  pdf_path: string | null
  has_no_readings: boolean
  generated_at: string
}

export interface CurrentCycleEstimate {
  meter_id: string
  cycle_start: string
  cycle_end: string
  units_consumed_kwh: number
  fixed_charge: number
  energy_charge: number
  estimated_amount: number
  currency: string
}

export async function getBillsForMeter(meterId: string): Promise<Bill[]> {
  const { data } = await api.get<Bill[]>(`/api/bills/${meterId}`)
  return data
}

export async function getCurrentEstimate(meterId: string): Promise<CurrentCycleEstimate> {
  const { data } = await api.get<CurrentCycleEstimate>(`/api/bills/${meterId}/estimate`)
  return data
}

export async function getAllBills(): Promise<Bill[]> {
  const { data } = await api.get<Bill[]>('/api/bills')
  return data
}

export async function payBill(billId: string): Promise<Bill> {
  const { data } = await api.post<Bill>(`/api/bills/${billId}/pay`)
  return data
}

export async function updateBillStatus(billId: string, status: Exclude<BillStatus, 'generated'>): Promise<Bill> {
  const { data } = await api.patch<Bill>(`/api/bills/${billId}/status`, { status })
  return data
}

/** Bill PDFs need the JWT auth header, so a plain <a href> won't work —
 * fetch as a blob and trigger the browser's save dialog manually. */
export async function downloadBillPdf(billId: string, filename: string): Promise<void> {
  const response = await api.get(`/api/bills/${billId}/pdf`, { responseType: 'blob' })
  const url = window.URL.createObjectURL(new Blob([response.data]))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

export interface Slab {
  upto_kwh: number | null
  rate: number
}

export interface TariffConfig {
  id: string
  effective_from: string
  slabs: Slab[]
  fixed_charge: number
  created_by: string
}

export async function getTariff(): Promise<TariffConfig> {
  const { data } = await api.get<TariffConfig>('/api/billing/tariff')
  return data
}

export async function createTariffVersion(payload: {
  slabs: Slab[]
  fixed_charge: number
  effective_from?: string
}): Promise<TariffConfig> {
  const { data } = await api.put<TariffConfig>('/api/billing/tariff', payload)
  return data
}

export async function generateBill(meterId: string, cycleStart: string, cycleEnd: string): Promise<Bill> {
  const { data } = await api.post<Bill>('/api/billing/generate', {
    meter_id: meterId,
    cycle_start: cycleStart,
    cycle_end: cycleEnd,
  })
  return data
}

export interface GenerateAllResult {
  generated: Bill[]
  skipped: { meter_id: string; meter_code: string; reason: string }[]
}

export async function generateAllBills(cycleStart: string, cycleEnd: string): Promise<GenerateAllResult> {
  const { data } = await api.post<GenerateAllResult>('/api/billing/generate-all', {
    cycle_start: cycleStart,
    cycle_end: cycleEnd,
  })
  return data
}
