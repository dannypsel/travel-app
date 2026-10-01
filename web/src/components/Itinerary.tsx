// Itinerary — the full trip rendered day-by-day, with a quick-add (+)
// on each day for ordinary events (meals, rest, …).

import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import type { Booking, Trip } from '@/types'
import { CATEGORY_EMOJI } from '@/types'
import { tripTimeline, type DayItem } from '@/lib/dayItems'
import { DualTime } from './DualTime'
import { DirectionsLink } from './DirectionsLink'
import { directionsUrl } from '@/lib/maps'
import { formatLongDate, formatShortDate, weekday } from '@/lib/tz'
import { EventForm, FormModal } from './Bookings'

interface Props {
  trips: Trip[]
  bookings: Booking[]
  selectedTripId: string | null
  onSelectTrip: (id: string) => void
  onAdd: (tripId: string, body: Partial<Booking>) => Promise<void>
  seedMode: boolean
}

function DayCard({ it, trip }: { it: DayItem; trip: Trip }) {
  const b = it.booking
  return (
    <li className="rounded-lg bg-white p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="text-2xl leading-none">
          {CATEGORY_EMOJI[b.category] ?? '📌'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {b.title}
            {it.suffix && (
              <span className="ml-1 text-xs font-normal text-slate-500">
                {it.suffix}
              </span>
            )}
          </p>
          {b.kind === 'flight' && !it.suffix ? (
            <>
              {b.depart_at && (
                <p className="mt-0.5 text-xs text-slate-500">
                  Departs <DualTime iso={b.depart_at} trip={trip} />
                </p>
              )}
              {b.arrive_at && (
                <p className="mt-0.5 text-xs text-slate-500">
                  Arrives <DualTime iso={b.arrive_at} trip={trip} />
                </p>
              )}
            </>
          ) : (
            it.when && (
              <p className="mt-0.5 text-xs text-slate-500">
                <DualTime iso={it.when} trip={trip} />
              </p>
            )
          )}
          {b.kind === 'flight' && b.flight_number && !it.suffix && (
            <p className="mt-0.5 text-xs text-slate-500">
              {b.airline} {b.flight_number} · {b.origin} → {b.destination}
              {b.seat ? ` · Seat ${b.seat}` : ''}{' '}
              <DirectionsLink booking={b} />
            </p>
          )}
          {b.kind === 'hotel' && b.hotel_name && (
            <p className="mt-0.5 text-xs text-slate-500">
              {b.check_in} → {b.check_out}
              {b.room_type ? ` · ${b.room_type}` : ''}{' '}
              <DirectionsLink booking={b} />
            </p>
          )}
          {b.kind === 'event' && (b.location || directionsUrl(b)) && (
            <p className="mt-0.5 text-xs text-slate-500">
              {b.location} <DirectionsLink booking={b} />
            </p>
          )}
          {b.notes && (
            <p className="mt-1 text-xs text-slate-500">{b.notes}</p>
          )}
        </div>
      </div>
    </li>
  )
}

export function Itinerary({
  trips,
  bookings,
  selectedTripId,
  onSelectTrip,
  onAdd,
  seedMode,
}: Props) {
  const trip = trips.find((t) => t.id === selectedTripId) ?? null
  const [quickAddDay, setQuickAddDay] = useState<string | null>(null)

  const days = useMemo(
    () => (trip ? tripTimeline(bookings, trip) : []),
    [bookings, trip],
  )

  return (
    <div>
      <select
        value={selectedTripId ?? ''}
        onChange={(e) => onSelectTrip(e.target.value)}
        className="mb-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
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
          Pick a trip to see its itinerary.
        </p>
      )}

      {trip && (
        <div>
          <h2 className="mb-1 text-lg font-semibold">{trip.name}</h2>
          <p className="mb-3 text-xs text-slate-500">
            {formatLongDate(trip.start_date)} → {formatLongDate(trip.end_date)} ·{' '}
            {trip.destination_tz}
          </p>

          <div className="space-y-4">
            {days.map(({ day, items }) => (
              <section key={day}>
                <h3 className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700">
                  <span>
                    {weekday(day)}, {formatLongDate(day)}
                  </span>
                  {!seedMode && (
                    <button
                      onClick={() => setQuickAddDay(day)}
                      aria-label={`Add to ${formatLongDate(day)}`}
                      title="Add to this day"
                      className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-brand-600"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  )}
                </h3>
                {items.length === 0 ? (
                  <p className="rounded-lg bg-white p-4 text-sm text-slate-500 shadow-sm">
                    Nothing planned for {formatShortDate(day)} — a free day.
                  </p>
                ) : (
                  <ol className="space-y-2 border-l-2 border-slate-200 pl-4">
                    {items.map((it, i) => (
                      <DayCard
                        key={`${it.booking.id}-${it.when ?? it.sortKey}-${i}`}
                        it={it}
                        trip={trip}
                      />
                    ))}
                  </ol>
                )}
              </section>
            ))}
          </div>
        </div>
      )}

      {quickAddDay && trip && (
        <FormModal
          title={`Add to ${formatLongDate(quickAddDay)}`}
          onClose={() => setQuickAddDay(null)}
        >
          <EventForm
            initial={{
              category: 'fun',
              start_at: `${quickAddDay}T12:00`,
              end_at: `${quickAddDay}T14:00`,
            }}
            submitLabel="Add"
            onSubmit={(body) => onAdd(trip.id, body)}
            onClose={() => setQuickAddDay(null)}
          />
        </FormModal>
      )}
    </div>
  )
}
