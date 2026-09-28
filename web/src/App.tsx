// Single-page app: tab navigation across the five screens. All data goes
// through the FastAPI backend with the Supabase JWT; Supabase is auth-only.

import { useCallback, useEffect, useState } from 'react'
import {
  CalendarDays,
  ListOrdered,
  Plane,
  ReceiptText,
  Wallet,
  LogOut,
  Plus,
  X,
} from 'lucide-react'
import { AuthProvider, useAuth } from '@/lib/auth'
import * as api from '@/lib/api'
import { ApiError } from '@/lib/api'
import type { Booking, Expense, Trip, TripBudgetResponse } from '@/types'
import { tripPacingLocal } from '@/lib/pacing'
import { SEED_BOOKINGS, SEED_BUDGET, SEED_EXPENSES, SEED_TRIP } from '@/seed'
import { SignIn } from '@/components/SignIn'
import { Calendar } from '@/components/Calendar'
import { Timeline } from '@/components/Timeline'
import { DailyPlan } from '@/components/DailyPlan'
import { Bookings } from '@/components/Bookings'
import { Budget } from '@/components/Budget'

type Tab = 'calendar' | 'timeline' | 'daily' | 'bookings' | 'budget'

const TABS: { id: Tab; label: string; icon: typeof Plane }[] = [
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'timeline', label: 'Timeline', icon: ListOrdered },
  { id: 'daily', label: 'Daily plan', icon: Plane },
  { id: 'bookings', label: 'Bookings', icon: ReceiptText },
  { id: 'budget', label: 'Budget', icon: Wallet },
]

function Shell() {
  const { session, token, ready, signOut } = useAuth()

  const [tab, setTab] = useState<Tab>('calendar')
  const [trips, setTrips] = useState<Trip[]>([])
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null)
  const [seedMode, setSeedMode] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [bookings, setBookings] = useState<Booking[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [budgetData, setBudgetData] = useState<TripBudgetResponse | null>(null)
  const [tripDataLoading, setTripDataLoading] = useState(false)
  const [tripDataError, setTripDataError] = useState<string | null>(null)

  const [addingTrip, setAddingTrip] = useState(false)

  // Load trips once signed in. Zero trips -> DEV-ONLY seed data.
  useEffect(() => {
    if (!token) return
    let cancelled = false
    void api
      .listTrips(token)
      .then((t) => {
        if (cancelled) return
        if (t.length === 0) {
          // Backend is fine, the account just has no trips yet: show an
          // empty state with a working "+ Trip" button (not seed data).
          setSeedMode(false)
          setTrips([])
          setSelectedTripId(null)
        } else {
          setSeedMode(false)
          setTrips(t)
          setSelectedTripId((prev) =>
            prev && t.some((x) => x.id === prev) ? prev : t[0].id,
          )
        }
        setLoadError(null)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        // Backend unreachable in local dev? Still render the seed trip.
        setSeedMode(true)
        setTrips([SEED_TRIP])
        setSelectedTripId(SEED_TRIP.id)
        setLoadError(e instanceof ApiError ? e.message : 'Could not reach the backend')
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const trip = trips.find((t) => t.id === selectedTripId) ?? null

  // Load per-trip data (bookings, expenses, budget+pacing).
  const refreshTripData = useCallback(async () => {
    if (!trip || !token) return
    if (seedMode && trip.id === SEED_TRIP.id) {
      const fixed = SEED_BOOKINGS.filter((b) => b.kind === 'flight').reduce(
        (s, b) => s + (b.cash_paid ?? 0),
        0,
      )
      const byDate: Record<string, number> = {}
      for (const e of SEED_EXPENSES) {
        byDate[e.date] = (byDate[e.date] ?? 0) + Number(e.amount)
      }
      setBookings(SEED_BOOKINGS)
      setExpenses(SEED_EXPENSES)
      setBudgetData({
        budget: {
          id: 'seed-budget',
          trip_id: SEED_TRIP.id,
          total_budget: SEED_BUDGET.total_budget,
          currency: SEED_BUDGET.currency,
        },
        pacing: tripPacingLocal(
          SEED_BUDGET.total_budget,
          fixed,
          SEED_TRIP.start_date,
          SEED_TRIP.end_date,
          byDate,
        ),
      })
      setTripDataError(null)
      return
    }
    setTripDataLoading(true)
    try {
      const [b, e, bd] = await Promise.all([
        api.listBookings(token, trip.id),
        api.listExpenses(token, trip.id),
        api.getBudget(token, trip.id),
      ])
      setBookings(b)
      setExpenses(e)
      setBudgetData(bd)
      setTripDataError(null)
    } catch (err: unknown) {
      setTripDataError(err instanceof Error ? err.message : 'Failed to load trip data')
    } finally {
      setTripDataLoading(false)
    }
  }, [trip, token, seedMode])

  useEffect(() => {
    void refreshTripData()
  }, [refreshTripData])

  // ---- mutations (real trips only; seed data is read-only) ----

  const addTrip = async (body: Partial<Trip>) => {
    if (!token || seedMode) return
    const t = await api.createTrip(token, body)
    setTrips((p) => [...p, t])
    setSelectedTripId(t.id)
    setAddingTrip(false)
  }

  const addBooking = async (tripId: string, body: Partial<Booking>) => {
    if (!token) return
    const b = await api.createBooking(token, tripId, body)
    setBookings((p) => [...p, b])
  }

  const deleteBooking = async (b: Booking) => {
    if (!token || seedMode) return
    if (!window.confirm(`Delete "${b.title}"?`)) return
    await api.deleteBooking(token, b.id)
    setBookings((p) => p.filter((x) => x.id !== b.id))
  }

  const setBudget = async (totalBudget: number, currency: string) => {
    if (!token || !trip || seedMode) return
    const bd = await api.setBudget(token, trip.id, { total_budget: totalBudget, currency })
    setBudgetData(bd)
  }

  const addExpense = async (body: Partial<Expense>) => {
    if (!token || !trip || seedMode) return
    const e = await api.createExpense(token, trip.id, body)
    setExpenses((p) => [...p, e])
    // refresh pacing after expense changes
    const bd = await api.getBudget(token, trip.id)
    setBudgetData(bd)
  }

  const deleteExpense = async (id: string) => {
    if (!token || !trip || seedMode) return
    await api.deleteExpense(token, id)
    setExpenses((p) => p.filter((x) => x.id !== id))
    const bd = await api.getBudget(token, trip.id)
    setBudgetData(bd)
  }

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-slate-500">
        Loading…
      </div>
    )
  }
  if (!session) return <SignIn />

  return (
    <div className="flex min-h-dvh flex-col bg-slate-100">
      {/* Header — safe-area padded for the iOS notch when launched from the home screen */}
      <header className="app-safe-top bg-white shadow-sm">
        <div className="app-safe-x mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Plane className="h-5 w-5 text-brand-600" />
            <h1 className="text-base font-semibold">Travel</h1>
            {seedMode && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                sample data
              </span>
            )}
          </div>
          <button
            onClick={() => void signOut()}
            aria-label="Sign out"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {loadError && (
        <div className="mx-auto w-full max-w-3xl px-4 pt-3">
          <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
            Backend: {loadError} — showing sample data.
          </p>
        </div>
      )}

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4 pb-24">
        {tab === 'calendar' && (
          <div>
            {!seedMode && (
              <button
                onClick={() => setAddingTrip(true)}
                className="mb-3 inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white"
              >
                <Plus className="h-4 w-4" /> Trip
              </button>
            )}
            <Calendar
              trips={trips}
              selectedTripId={selectedTripId}
              onSelectTrip={setSelectedTripId}
            />
            {!seedMode && trips.length === 0 && (
              <p className="mt-4 rounded-lg bg-white p-4 text-center text-sm text-slate-500 shadow-sm">
                No trips yet. Tap <span className="font-medium text-slate-700">+ Trip</span> above
                to add your first one.
              </p>
            )}
          </div>
        )}
        {tab === 'timeline' && (
          <Timeline
            trips={trips}
            bookings={bookings}
            selectedTripId={selectedTripId}
            onSelectTrip={setSelectedTripId}
          />
        )}
        {tab === 'daily' && (
          <DailyPlan
            trips={trips}
            bookings={bookings}
            selectedTripId={selectedTripId}
            onSelectTrip={setSelectedTripId}
          />
        )}
        {tab === 'bookings' && (
          <Bookings
            trips={trips}
            bookings={bookings}
            selectedTripId={selectedTripId}
            onSelectTrip={setSelectedTripId}
            onAdd={addBooking}
            onDelete={deleteBooking}
            seedMode={seedMode}
          />
        )}
        {tab === 'budget' && (
          <Budget
            trips={trips}
            bookings={bookings}
            selectedTripId={selectedTripId}
            onSelectTrip={setSelectedTripId}
            data={budgetData}
            expenses={expenses}
            loading={tripDataLoading}
            error={tripDataError}
            onSetBudget={setBudget}
            onAddExpense={addExpense}
            onDeleteExpense={deleteExpense}
            seedMode={seedMode}
          />
        )}
      </main>

      {/* Bottom tab bar — safe-area padded for the home indicator */}
      <nav className="app-safe-bottom fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white">
        <div className="app-safe-x mx-auto grid max-w-3xl grid-cols-5">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${
                tab === id ? 'text-brand-600' : 'text-slate-500'
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>
      </nav>

      {addingTrip && (
        <AddTripModal onClose={() => setAddingTrip(false)} onSave={addTrip} />
      )}
    </div>
  )
}

function AddTripModal({
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: (b: Partial<Trip>) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [destination, setDestination] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [tz, setTz] = useState('Asia/Tokyo')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await onSave({
        name,
        destination,
        destination_tz: tz || 'Asia/Tokyo',
        home_tz: 'America/Los_Angeles',
        start_date: start,
        end_date: end,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <form
        onSubmit={submit}
        className="w-full max-w-lg space-y-3 rounded-t-2xl bg-white p-5 sm:rounded-2xl"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Add trip</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Trip name"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-600"
        />
        <input
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="Destination"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-600"
        />
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Start</span>
            <input
              type="date"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">End</span>
            <input
              type="date"
              required
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            Destination timezone
          </span>
          <input
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            placeholder="Asia/Tokyo"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-600"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-brand-600 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Add trip'}
        </button>
      </form>
    </div>
  )
}

export function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  )
}
