// Screen 5 — Trip budget: set budget, manual expense entries, daily pacing.
// daily allowance = (budget − flights/hotels fixed costs) ÷ days;
// per-day spent vs allowance with over/under indicator.

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { Booking, Expense, Trip, TripBudgetResponse } from '@/types'
import { CATEGORY_EMOJI } from '@/types'
import { formatLongDate, formatShortDate } from '@/lib/tz'

interface Props {
  trips: Trip[]
  bookings: Booking[]
  selectedTripId: string | null
  onSelectTrip: (id: string) => void
  data: TripBudgetResponse | null
  expenses: Expense[]
  loading: boolean
  error: string | null
  onSetBudget: (total: number, currency: string) => Promise<void>
  onAddExpense: (e: Partial<Expense>) => Promise<void>
  onDeleteExpense: (id: string) => Promise<void>
  seedMode: boolean
}

function money(n: number, cur = 'USD'): string {
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${cur}`
}

/** Fixed costs = flight cash_paid + hotel resort fees (per spec: fixed = flights/hotels). */
function fixedCosts(bookings: Booking[]): number {
  return bookings.reduce((sum, b) => {
    if (b.kind === 'flight') return sum + (b.cash_paid ?? 0)
    if (b.kind === 'hotel') return sum + (b.resort_fees ?? 0)
    return sum
  }, 0)
}

function StatusBadge({ status }: { status: 'over' | 'under' | 'even' }) {
  if (status === 'over')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
        ▲ over
      </span>
    )
  if (status === 'under')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
        ▼ under
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
      ● even
    </span>
  )
}

export function Budget({
  trips,
  bookings,
  selectedTripId,
  onSelectTrip,
  data,
  expenses,
  loading,
  error,
  onSetBudget,
  onAddExpense,
  onDeleteExpense,
  seedMode,
}: Props) {
  const trip = trips.find((t) => t.id === selectedTripId) ?? null

  const [total, setTotal] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [saving, setSaving] = useState(false)

  const [expDate, setExpDate] = useState('')
  const [expAmount, setExpAmount] = useState('')
  const [expCategory, setExpCategory] = useState('food')
  const [expNote, setExpNote] = useState('')
  const [addingExpense, setAddingExpense] = useState(false)

  const saveBudget = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = Number(total)
    if (!Number.isFinite(n) || n < 0) return
    setSaving(true)
    try {
      await onSetBudget(n, currency || 'USD')
      setTotal('')
    } finally {
      setSaving(false)
    }
  }

  const addExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = Number(expAmount)
    if (!expDate || !Number.isFinite(n) || n < 0) return
    setAddingExpense(true)
    try {
      await onAddExpense({
        date: expDate,
        amount: n,
        currency: data?.budget?.currency ?? 'USD',
        category: expCategory,
        note: expNote || null,
        source: 'manual',
      })
      setExpDate('')
      setExpAmount('')
      setExpNote('')
    } finally {
      setAddingExpense(false)
    }
  }

  const fixed = fixedCosts(bookings)
  const cur = data?.budget?.currency ?? 'USD'

  return (
    <div>
      <select
        value={selectedTripId ?? ''}
        onChange={(e) => onSelectTrip(e.target.value)}
        className="mb-4 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        aria-label="Select trip"
      >
        <option value="" disabled>
          Select a trip…
        </option>
        {trips.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>

      {!trip && (
        <p className="text-sm text-slate-500">
          Pick a trip to see its budget and pacing.
        </p>
      )}

      {trip && loading && <p className="text-sm text-slate-500">Loading…</p>}
      {trip && error && <p className="text-sm text-red-600">{error}</p>}

      {trip && !loading && (
        <div className="space-y-5">
          {/* Summary */}
          {data?.budget ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ['Budget', money(Number(data.budget.total_budget), cur)],
                ['Fixed (flights/hotels)', money(fixed, cur)],
                ['Spent', money(data.pacing?.total_spent ?? 0, cur)],
                ['Remaining', money(data.pacing?.remaining ?? 0, cur)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-white p-3 shadow-sm">
                  <p className="text-[11px] text-slate-500">{label}</p>
                  <p className="text-base font-semibold tabular-nums">{value}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg bg-white p-4 text-sm text-slate-500 shadow-sm">
              No budget set for this trip yet — set one below.
            </p>
          )}

          {data?.pacing && (
            <div className="rounded-lg bg-brand-50 p-3 text-sm">
              <span className="font-medium">Daily allowance:</span>{' '}
              <span className="font-semibold tabular-nums">
                {money(data.pacing.daily_allowance, cur)}
              </span>
              <span className="text-slate-500"> / day</span>
            </div>
          )}

          {/* Set budget */}
          {!seedMode && (
            <form
              onSubmit={saveBudget}
              className="rounded-lg bg-white p-4 shadow-sm"
            >
              <h3 className="mb-2 text-sm font-semibold">Set trip budget</h3>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  placeholder={data?.budget ? String(data.budget.total_budget) : '3000'}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-600"
                />
                <input
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  placeholder="USD"
                  maxLength={3}
                  className="w-20 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-600"
                  aria-label="Currency"
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          )}

          {/* Daily pacing */}
          {data?.pacing && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-700">
                Daily pacing
              </h3>
              <div className="space-y-1.5">
                {data.pacing.days.map((d) => (
                  <div
                    key={d.date}
                    className="flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-sm"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {formatShortDate(d.date)}
                      </p>
                      <p className="text-xs text-slate-500 tabular-nums">
                        spent {money(d.spent, cur)} / allowance{' '}
                        {money(d.allowance, cur)}
                      </p>
                    </div>
                    <StatusBadge status={d.status} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Add expense */}
          {!seedMode && (
            <form
              onSubmit={addExpense}
              className="rounded-lg bg-white p-4 shadow-sm"
            >
              <h3 className="mb-2 text-sm font-semibold">Add expense</h3>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  required
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-600"
                  aria-label="Date"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  placeholder="Amount"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-600"
                  aria-label="Amount"
                />
                <select
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  aria-label="Category"
                >
                  <option value="food">🍽️ food</option>
                  <option value="fun">🎉 fun</option>
                  <option value="transport">🚗 transport</option>
                  <option value="hotel">🏨 hotel</option>
                  <option value="flight">✈️ flight</option>
                  <option value="other">📌 other</option>
                </select>
                <input
                  value={expNote}
                  onChange={(e) => setExpNote(e.target.value)}
                  placeholder="Note"
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-600"
                  aria-label="Note"
                />
              </div>
              <button
                type="submit"
                disabled={addingExpense}
                className="mt-2 w-full rounded-lg bg-brand-600 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {addingExpense ? 'Adding…' : 'Add expense'}
              </button>
            </form>
          )}

          {/* Expense list */}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Expenses</h3>
            {expenses.length === 0 && (
              <p className="text-xs text-slate-400">None yet.</p>
            )}
            <div className="space-y-1.5">
              {expenses.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-sm"
                >
                  <div className="flex items-center gap-2">
                    <span>{CATEGORY_EMOJI[e.category] ?? '📌'}</span>
                    <div>
                      <p className="text-sm font-medium tabular-nums">
                        {money(Number(e.amount), e.currency)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatLongDate(e.date)}
                        {e.note ? ` · ${e.note}` : ''}
                        {e.source === 'auto' ? ' · auto' : ''}
                      </p>
                    </div>
                  </div>
                  {!seedMode && (
                    <button
                      onClick={() => void onDeleteExpense(e.id)}
                      aria-label="Delete expense"
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
