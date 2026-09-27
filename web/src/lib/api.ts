// Thin fetch wrapper around the FastAPI backend. Auth: Supabase JWT in the
// Authorization header on every call (except /health). The frontend never
// talks to Supabase tables directly.

import type {
  Booking,
  Expense,
  ImportDraft,
  Trip,
  TripBudgetResponse,
} from '@/types'

const BASE = (import.meta.env.VITE_BACKEND_URL ?? '').replace(/\/$/, '')

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  if (!BASE) throw new ApiError(0, 'VITE_BACKEND_URL is not set')
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = (await res.json()) as { detail?: string }
      if (body.detail) detail = body.detail
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

const post = <T>(path: string, token: string, body: unknown) =>
  request<T>(path, token, { method: 'POST', body: JSON.stringify(body) })
const put = <T>(path: string, token: string, body: unknown) =>
  request<T>(path, token, { method: 'PUT', body: JSON.stringify(body) })
const patch = <T>(path: string, token: string, body: unknown) =>
  request<T>(path, token, { method: 'PATCH', body: JSON.stringify(body) })
const del = (path: string, token: string) =>
  request<void>(path, token, { method: 'DELETE' })

// Trips
export const listTrips = (t: string) => request<Trip[]>('/trips', t)
export const createTrip = (t: string, body: Partial<Trip>) =>
  post<Trip>('/trips', t, body)
export const getTrip = (t: string, id: string) => request<Trip>(`/trips/${id}`, t)
export const updateTrip = (t: string, id: string, body: Partial<Trip>) =>
  patch<Trip>(`/trips/${id}`, t, body)
export const deleteTrip = (t: string, id: string) => del(`/trips/${id}`, t)

// Bookings
export const listBookings = (t: string, tripId: string) =>
  request<Booking[]>(`/trips/${tripId}/bookings`, t)
export const createBooking = (t: string, tripId: string, body: Partial<Booking>) =>
  post<Booking>(`/trips/${tripId}/bookings`, t, body)
export const updateBooking = (t: string, id: string, body: Partial<Booking>) =>
  patch<Booking>(`/bookings/${id}`, t, body)
export const deleteBooking = (t: string, id: string) => del(`/bookings/${id}`, t)

// Expenses
export const listExpenses = (t: string, tripId: string) =>
  request<Expense[]>(`/trips/${tripId}/expenses`, t)
export const createExpense = (t: string, tripId: string, body: Partial<Expense>) =>
  post<Expense>(`/trips/${tripId}/expenses`, t, body)
export const deleteExpense = (t: string, id: string) => del(`/expenses/${id}`, t)

// Budget + pacing
export const getBudget = (t: string, tripId: string) =>
  request<TripBudgetResponse>(`/trips/${tripId}/budget`, t)
export const setBudget = (
  t: string,
  tripId: string,
  body: { total_budget: number; currency?: string },
) => put<TripBudgetResponse>(`/trips/${tripId}/budget`, t, body)

// Import queue (email drafts)
export const listDrafts = (t: string) => request<ImportDraft[]>('/import-queue', t)
export const confirmDraft = (t: string, id: string, tripId: string) =>
  post<Booking>(`/import-queue/${id}/confirm`, t, { trip_id: tripId })
export const discardDraft = (t: string, id: string) =>
  post<void>(`/import-queue/${id}/discard`, t, {})

export const health = () =>
  fetch(`${BASE}/health`).then((r) => (r.ok ? r.json() : Promise.reject(new Error('unhealthy'))))
