// Screen 3 — Daily plan: one day of a trip, bookings/events with emoji
// category labels, dual-timezone times.

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Booking, Trip } from '@/types'
import { CATEGORY_EMOJI } from '@/types'
import { tripTimeline } from '@/lib/dayItems'
import { DualTime } from './DualTime'
import {
  addDays,
  formatLongDate,
  formatShortDate,
  weekday,
} from '@/lib/tz'

interface Props {
  trips: Trip[]
  bookings: Booking[]
  selectedTripId: string | null
  onSelectTrip: (id: string) => void
}

export function DailyPlan({
  trips,
  bookings,
  selectedTripId,
  onSelectTrip,
}: Props) {
  const trip = trips.find((t) => t.id === selectedTripId) ?? null

  const [day, setDay] = useState<string | null>(null)

  const days = useMemo(
    () => (trip ? tripTimeline(bookings, trip) : []),
    [bookings, trip],
  )

  const effectiveDay =
    day && trip && day >= trip.start_date && day <= trip.end_date
      ? day
      : trip?.start_date ?? null
  const items =
    days.find((d) => d.day === effectiveDay)?.items ?? []

  const step = (n: number) => {
    if (!trip || !effectiveDay) return
    const next = addDays(effectiveDay, n)
    if (next >= trip.start_date && next <= trip.end_date) setDay(next)
  }

  return (
    <div>
      <select
        value={selectedTripId ?? ''}
        onChange={(e) => {
          onSelectTrip(e.target.value)
          setDay(null)
        }}
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
          Pick a trip to see its daily plan.
        </p>
      )}

      {trip && effectiveDay && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <button
              onClick={() => step(-1)}
              disabled={effectiveDay <= trip.start_date}
              aria-label="Previous day"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="text-center">
              <h2 className="text-base font-semibold">
                {weekday(effectiveDay)}, {formatLongDate(effectiveDay)}
              </h2>
              <p className="text-xs text-slate-500">{trip.name}</p>
            </div>
            <button
              onClick={() => step(1)}
              disabled={effectiveDay >= trip.end_date}
              aria-label="Next day"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {items.length === 0 && (
            <p className="rounded-lg bg-white p-4 text-sm text-slate-500 shadow-sm">
              Nothing planned for {formatShortDate(effectiveDay)} — a free day.
            </p>
          )}

          <ol className="space-y-2">
            {items.map((it, i) => (
              <li
                key={`${it.booking.id}-${it.when ?? it.sortKey}-${i}`}
                className="rounded-lg bg-white p-3 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl leading-none">
                    {CATEGORY_EMOJI[it.booking.category] ?? '📌'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {it.booking.title}
                      {it.suffix && (
                        <span className="ml-1 text-xs font-normal text-slate-500">
                          {it.suffix}
                        </span>
                      )}
                    </p>
                    {it.when && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        <DualTime iso={it.when} trip={trip} />
                      </p>
                    )}
                    {it.booking.kind === 'flight' && it.booking.flight_number && !it.suffix && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        {it.booking.airline} {it.booking.flight_number} ·{' '}
                        {it.booking.origin} → {it.booking.destination}
                        {it.booking.seat ? ` · Seat ${it.booking.seat}` : ''}
                      </p>
                    )}
                    {it.booking.kind === 'hotel' && it.booking.hotel_name && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        {it.booking.check_in} → {it.booking.check_out}
                        {it.booking.room_type ? ` · ${it.booking.room_type}` : ''}
                      </p>
                    )}
                    {it.booking.kind === 'event' && it.booking.location && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        {it.booking.location}
                      </p>
                    )}
                    {it.booking.notes && (
                      <p className="mt-1 text-xs text-slate-500">{it.booking.notes}</p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
