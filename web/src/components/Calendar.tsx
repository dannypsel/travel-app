// Screen 1 — Month calendar. Prev/next month navigation; multi-month trips
// render as bars spanning month boundaries; every timestamp dual-timezone.

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Trip } from '@/types'
import { parseDateOnly, toDateOnly } from '@/lib/tz'

interface Props {
  trips: Trip[]
  selectedTripId: string | null
  onSelectTrip: (id: string) => void
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** All YYYY-MM-DD days in the grid for a month view (leading/trailing padding). */
function monthGrid(year: number, month: number): string[] {
  const first = new Date(Date.UTC(year, month, 1))
  const startOffset = first.getUTCDay()
  const days: string[] = []
  const cursor = new Date(first)
  cursor.setUTCDate(cursor.getUTCDate() - startOffset)
  for (let i = 0; i < 42; i++) {
    days.push(toDateOnly(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

const COLORS = [
  'bg-sky-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-teal-500',
]

export function Calendar({ trips, selectedTripId, onSelectTrip }: Props) {
  const today = toDateOnly(new Date())
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth())

  const days = useMemo(() => monthGrid(viewYear, viewMonth), [viewYear, viewMonth])

  const monthLabel = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(viewYear, viewMonth, 1)))

  const prev = () => {
    const d = new Date(Date.UTC(viewYear, viewMonth - 1, 1))
    setViewYear(d.getUTCFullYear())
    setViewMonth(d.getUTCMonth())
  }
  const next = () => {
    const d = new Date(Date.UTC(viewYear, viewMonth + 1, 1))
    setViewYear(d.getUTCFullYear())
    setViewMonth(d.getUTCMonth())
  }

  // Trips overlapping a given day (multi-month trips naturally appear in
  // every month view they span).
  const tripsOn = (day: string) =>
    trips
      .map((t, i) => ({ t, color: COLORS[i % COLORS.length] }))
      .filter(({ t }) => day >= t.start_date && day <= t.end_date)

  const monthKey = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`
  const firstVisibleDay = days[0]

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={prev}
          aria-label="Previous month"
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="text-lg font-semibold">{monthLabel}</h2>
        <button
          onClick={next}
          aria-label="Next month"
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl bg-slate-200">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="bg-slate-50 py-1.5 text-center text-[11px] font-medium text-slate-500"
          >
            {w}
          </div>
        ))}
        {days.map((day) => {
          const inMonth = day.startsWith(monthKey)
          const isToday = day === today
          const dayTrips = tripsOn(day)
          const dayNum = parseDateOnly(day).getUTCDate()
          return (
            <div
              key={day}
              className={`min-h-[64px] bg-white p-1 ${inMonth ? '' : 'opacity-40'}`}
            >
              <div
                className={`mb-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
                  isToday ? 'bg-brand-600 font-bold text-white' : 'text-slate-600'
                }`}
              >
                {dayNum}
              </div>
              <div className="space-y-0.5">
                {dayTrips.map(({ t, color }) => {
                  // Name on the trip's start day; continuation days (incl.
                  // spanning month boundaries) show the bar without the label.
                  const showLabel = day === t.start_date || day === firstVisibleDay
                  return (
                    <button
                      key={t.id}
                      onClick={() => onSelectTrip(t.id)}
                      title={t.name}
                      className={`flex w-full items-center overflow-hidden rounded px-1 py-0.5 text-left ${color} bg-opacity-90 ${
                        selectedTripId === t.id ? 'ring-2 ring-brand-600' : ''
                      }`}
                    >
                      <span className="truncate text-[10px] font-medium text-white">
                        {showLabel ? t.name : ' '}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Tap a trip bar to select it for the other tabs.
      </p>
    </div>
  )
}
