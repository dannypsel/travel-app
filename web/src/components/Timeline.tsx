// Screen 2 — Trip day-by-day timeline: select a trip → its days →
// bookings/events in time order.

import { useMemo } from 'react'
import type { Booking, Trip } from '@/types'
import { CATEGORY_EMOJI } from '@/types'
import { tripTimeline } from '@/lib/dayItems'
import { DualTime } from './DualTime'
import { formatLongDate, weekday } from '@/lib/tz'

interface Props {
  trips: Trip[]
  bookings: Booking[]
  selectedTripId: string | null
  onSelectTrip: (id: string) => void
}

export function Timeline({ trips, bookings, selectedTripId, onSelectTrip }: Props) {
  const trip = trips.find((t) => t.id === selectedTripId) ?? null

  const days = useMemo(
    () => (trip ? tripTimeline(bookings, trip) : []),
    [bookings, trip],
  )

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
          Pick a trip to see its day-by-day timeline.
        </p>
      )}

      {trip && (
        <div>
          <h2 className="mb-1 text-lg font-semibold">{trip.name}</h2>
          <p className="mb-4 text-xs text-slate-500">
            {formatLongDate(trip.start_date)} → {formatLongDate(trip.end_date)} ·{' '}
            {trip.destination_tz}
          </p>

          {days.length === 0 && (
            <p className="text-sm text-slate-500">
              No bookings yet — add some on the Bookings tab.
            </p>
          )}

          <div className="space-y-4">
            {days.map(({ day, items }) => (
              <section key={day}>
                <h3 className="mb-2 text-sm font-semibold text-slate-700">
                  {weekday(day)}, {formatLongDate(day)}
                </h3>
                <ol className="space-y-2 border-l-2 border-slate-200 pl-4">
                  {items.map((it, i) => (
                    <li
                      key={`${it.booking.id}-${it.when ?? it.sortKey}-${i}`}
                      className="rounded-lg bg-white p-3 shadow-sm"
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-lg leading-none">
                          {CATEGORY_EMOJI[it.booking.category] ?? '📌'}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
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
                            <p className="text-xs text-slate-500">
                              {it.booking.airline} {it.booking.flight_number} ·{' '}
                              {it.booking.origin} → {it.booking.destination}
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
