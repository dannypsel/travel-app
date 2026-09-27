// Screen 4 — Bookings board with FULL fields from the data model +
// Add flight / Add hotel / Add event forms. cents-per-point is shown but
// visually deprioritized at the bottom of flight detail/form.

import { useMemo, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import type { Booking, BookingKind, Category, Trip } from '@/types'
import { CATEGORY_EMOJI } from '@/types'
import { DualTime } from './DualTime'
import { DirectionsLink } from './DirectionsLink'
import { formatShortDate } from '@/lib/tz'

interface Props {
  trips: Trip[]
  bookings: Booking[]
  selectedTripId: string | null
  onSelectTrip: (id: string) => void
  onAdd: (tripId: string, body: Partial<Booking>) => Promise<void>
  onDelete: (booking: Booking) => Promise<void>
  seedMode: boolean
}

const KIND_LABEL: Record<BookingKind, string> = {
  flight: 'Flights',
  hotel: 'Hotels',
  event: 'Events',
}

function fmtMoney(n: number | null | undefined, cur?: string | null): string | null {
  if (n == null) return null
  return `${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${cur ?? 'USD'}`
}

function fmtPts(n: number | null | undefined, cur?: string | null): string | null {
  if (n == null) return null
  return `${Number(n).toLocaleString('en-US')} ${cur ?? 'pts'}`
}

/** datetime-local value -> ISO string, or null when empty. */
export function localToIso(v: string): string | null {
  if (!v) return null
  return new Date(v).toISOString()
}

/** ISO string -> datetime-local value. */
export function isoToLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

// ---------------------------------------------------------------------------
// Detail card
// ---------------------------------------------------------------------------

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-32 shrink-0 text-slate-500">{label}</span>
      <span className="min-w-0 break-words">{value}</span>
    </div>
  )
}

function FlightCard({ b, trip }: { b: Booking; trip: Trip }) {
  return (
    <div className="space-y-1">
      <Field
        label="Route"
        value={
          b.depart_at ? (
            <>
              <DualTime iso={b.depart_at} trip={trip} />
              {b.arrive_at && (
                <>
                  {' → '}
                  <DualTime iso={b.arrive_at} trip={trip} mode="time" />
                </>
              )}
            </>
          ) : null
        }
      />
      <Field label="Airline" value={b.airline} />
      <Field label="Flight" value={b.flight_number} />
      <Field label="Directions" value={<DirectionsLink booking={b} />} />
      <Field label="Confirmation" value={b.confirmation_number} />
      <Field label="Ticket" value={b.ticket_number} />
      <Field label="Seat" value={b.seat} />
      <Field label="Checked bags" value={b.checked_bags ?? null} />
      <Field label="Cost" value={fmtMoney(b.cash_paid, b.cash_currency)} />
      <Field label="Points" value={fmtPts(b.points_cost, b.point_currency)} />
      <Field label="Booked with" value={b.booking_account} />
      <Field
        label="Change/cancel by"
        value={b.change_cancel_deadline ? formatShortDate(b.change_cancel_deadline) : null}
      />
      <Field label="Notes" value={b.notes} />
      {/* Visually deprioritized, at the bottom */}
      {b.cents_per_point != null && (
        <p className="pt-1 text-[11px] text-slate-400">
          {Number(b.cents_per_point).toFixed(2)}¢/pt
        </p>
      )}
    </div>
  )
}

function HotelCard({ b }: { b: Booking }) {
  return (
    <div className="space-y-1">
      <Field label="Hotel" value={b.hotel_name} />
      <Field
        label="Address"
        value={
          b.address ? (
            <>
              {b.address} <DirectionsLink booking={b} />
            </>
          ) : (
            <DirectionsLink booking={b} />
          )
        }
      />
      <Field label="Maps link" value={b.maps_url} />
      <Field
        label="Stay"
        value={
          b.check_in
            ? `${formatShortDate(b.check_in)} → ${b.check_out ? formatShortDate(b.check_out) : ''}`
            : null
        }
      />
      <Field label="Room" value={b.room_type} />
      <Field label="Free-night certs" value={b.free_night_certs ?? null} />
      <Field label="Resort fees" value={fmtMoney(b.resort_fees, 'USD')} />
      <Field label="Confirmation" value={b.confirmation_number} />
      <Field label="Booked with" value={b.booking_account} />
      <Field
        label="Cancel by"
        value={b.cancellation_deadline ? formatShortDate(b.cancellation_deadline) : null}
      />
      <Field label="Notes" value={b.notes} />
    </div>
  )
}

function EventCard({ b, trip }: { b: Booking; trip: Trip }) {
  return (
    <div className="space-y-1">
      <Field
        label="When"
        value={b.start_at ? <DualTime iso={b.start_at} trip={trip} /> : null}
      />
      <Field
        label="Location"
        value={
          b.location ? (
            <>
              {b.location} <DirectionsLink booking={b} />
            </>
          ) : (
            <DirectionsLink booking={b} />
          )
        }
      />
      <Field label="Maps link" value={b.maps_url} />
      <Field label="Cost" value={fmtMoney(b.cost, 'USD')} />
      <Field label="Notes" value={b.notes} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...rest } = props
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <input
        {...rest}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-600"
      />
    </label>
  )
}

function Select(
  props: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string },
) {
  const { label, children, ...rest } = props
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <select
        {...rest}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-600"
      >
        {children}
      </select>
    </label>
  )
}

type Draft = Record<string, string>

function FlightForm({ onSubmit, onClose }: { onSubmit: (b: Partial<Booking>) => Promise<void>; onClose: () => void }) {
  const [f, setF] = useState<Draft>({})
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }))
  const num = (v: string | undefined) => (v === undefined || v === '' ? null : Number(v))
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSubmit({
      kind: 'flight',
      category: 'flight',
      title: f.title || `${f.flight_number ?? ''} ${f.origin ?? ''}→${f.destination ?? ''}`.trim(),
      airline: f.airline || null,
      flight_number: f.flight_number || null,
      origin: f.origin || null,
      destination: f.destination || null,
      depart_at: localToIso(f.depart_at ?? ''),
      arrive_at: localToIso(f.arrive_at ?? ''),
      points_cost: num(f.points_cost),
      point_currency: f.point_currency || null,
      cash_paid: num(f.cash_paid),
      cash_currency: f.cash_currency || 'USD',
      booking_account: f.booking_account || null,
      confirmation_number: f.confirmation_number || null,
      ticket_number: f.ticket_number || null,
      seat: f.seat || null,
      checked_bags: num(f.checked_bags),
      change_cancel_deadline: f.change_cancel_deadline || null,
      cents_per_point: num(f.cents_per_point),
      maps_url: f.maps_url || null,
      notes: f.notes || null,
    })
    onClose()
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <Input label="Title" value={f.title ?? ''} onChange={set('title')} placeholder="DL 45 · LAX → HND" />
      <Input label="Google Maps link (optional override)" value={f.maps_url ?? ''} onChange={set('maps_url')} placeholder="https://maps.google.com/…" />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Airline" value={f.airline ?? ''} onChange={set('airline')} />
        <Input label="Flight number" value={f.flight_number ?? ''} onChange={set('flight_number')} required />
        <Input label="From" value={f.origin ?? ''} onChange={set('origin')} placeholder="LAX" />
        <Input label="To" value={f.destination ?? ''} onChange={set('destination')} placeholder="HND" />
        <Input label="Departs" type="datetime-local" value={f.depart_at ?? ''} onChange={set('depart_at')} />
        <Input label="Arrives" type="datetime-local" value={f.arrive_at ?? ''} onChange={set('arrive_at')} />
        <Input label="Points cost" type="number" min="0" value={f.points_cost ?? ''} onChange={set('points_cost')} />
        <Input label="Point currency" value={f.point_currency ?? ''} onChange={set('point_currency')} placeholder="Amex MR" />
        <Input label="Cash paid" type="number" min="0" step="0.01" value={f.cash_paid ?? ''} onChange={set('cash_paid')} />
        <Input label="Cash currency" value={f.cash_currency ?? 'USD'} onChange={set('cash_currency')} />
        <Input label="Booking account" value={f.booking_account ?? ''} onChange={set('booking_account')} placeholder="Daniel · SkyMiles" />
        <Input label="Confirmation #" value={f.confirmation_number ?? ''} onChange={set('confirmation_number')} />
        <Input label="Ticket #" value={f.ticket_number ?? ''} onChange={set('ticket_number')} />
        <Input label="Seat" value={f.seat ?? ''} onChange={set('seat')} />
        <Input label="Checked bags" type="number" min="0" value={f.checked_bags ?? ''} onChange={set('checked_bags')} />
        <Input label="Change/cancel by" type="date" value={f.change_cancel_deadline ?? ''} onChange={set('change_cancel_deadline')} />
      </div>
      {/* Deprioritized: bottom of the form, muted */}
      <div className="border-t border-slate-100 pt-3">
        <Input
          label="Cents per point (reference only)"
          type="number"
          min="0"
          step="0.01"
          value={f.cents_per_point ?? ''}
          onChange={set('cents_per_point')}
        />
      </div>
      <Input label="Notes" value={f.notes ?? ''} onChange={set('notes')} />
      <button type="submit" className="w-full rounded-lg bg-brand-600 py-2 text-sm font-medium text-white">
        Add flight
      </button>
    </form>
  )
}

function HotelForm({ onSubmit, onClose }: { onSubmit: (b: Partial<Booking>) => Promise<void>; onClose: () => void }) {
  const [f, setF] = useState<Draft>({})
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }))
  const num = (v: string | undefined) => (v === undefined || v === '' ? null : Number(v))
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSubmit({
      kind: 'hotel',
      category: 'hotel',
      title: f.hotel_name || 'Hotel stay',
      hotel_name: f.hotel_name || null,
      address: f.address || null,
      check_in: f.check_in || null,
      check_out: f.check_out || null,
      room_type: f.room_type || null,
      free_night_certs: num(f.free_night_certs),
      resort_fees: num(f.resort_fees),
      confirmation_number: f.confirmation_number || null,
      booking_account: f.booking_account || null,
      cancellation_deadline: f.cancellation_deadline || null,
      maps_url: f.maps_url || null,
      notes: f.notes || null,
    })
    onClose()
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <Input label="Hotel name" value={f.hotel_name ?? ''} onChange={set('hotel_name')} required />
      <Input label="Address" value={f.address ?? ''} onChange={set('address')} />
      <Input label="Google Maps link (optional override)" value={f.maps_url ?? ''} onChange={set('maps_url')} placeholder="https://maps.google.com/…" />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Check-in" type="date" value={f.check_in ?? ''} onChange={set('check_in')} required />
        <Input label="Check-out" type="date" value={f.check_out ?? ''} onChange={set('check_out')} required />
        <Input label="Room type" value={f.room_type ?? ''} onChange={set('room_type')} />
        <Input label="Free-night certs" type="number" min="0" value={f.free_night_certs ?? ''} onChange={set('free_night_certs')} />
        <Input label="Resort fees (USD)" type="number" min="0" step="0.01" value={f.resort_fees ?? ''} onChange={set('resort_fees')} />
        <Input label="Confirmation #" value={f.confirmation_number ?? ''} onChange={set('confirmation_number')} />
        <Input label="Booking account" value={f.booking_account ?? ''} onChange={set('booking_account')} placeholder="Sara · Marriott Bonvoy" />
        <Input label="Cancel by" type="date" value={f.cancellation_deadline ?? ''} onChange={set('cancellation_deadline')} />
      </div>
      <Input label="Notes" value={f.notes ?? ''} onChange={set('notes')} />
      <button type="submit" className="w-full rounded-lg bg-brand-600 py-2 text-sm font-medium text-white">
        Add hotel
      </button>
    </form>
  )
}

function EventForm({ onSubmit, onClose }: { onSubmit: (b: Partial<Booking>) => Promise<void>; onClose: () => void }) {
  const [f, setF] = useState<Draft>({ category: 'fun' })
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }))
  const num = (v: string | undefined) => (v === undefined || v === '' ? null : Number(v))
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSubmit({
      kind: 'event',
      category: (f.category as Category) ?? 'other',
      title: f.title || 'Event',
      location: f.location || null,
      maps_url: f.maps_url || null,
      start_at: localToIso(f.start_at ?? ''),
      end_at: localToIso(f.end_at ?? ''),
      cost: num(f.cost),
      notes: f.notes || null,
    })
    onClose()
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <Input label="Title" value={f.title ?? ''} onChange={set('title')} required />
      <Input label="Google Maps link (optional override)" value={f.maps_url ?? ''} onChange={set('maps_url')} placeholder="https://maps.google.com/…" />
      <Select label="Category" value={f.category ?? 'fun'} onChange={set('category')}>
        <option value="food">🍽️ food</option>
        <option value="fun">🎉 fun</option>
        <option value="transport">🚗 transport</option>
        <option value="other">📌 other</option>
      </Select>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Starts" type="datetime-local" value={f.start_at ?? ''} onChange={set('start_at')} />
        <Input label="Ends" type="datetime-local" value={f.end_at ?? ''} onChange={set('end_at')} />
        <Input label="Location" value={f.location ?? ''} onChange={set('location')} />
        <Input label="Cost (USD)" type="number" min="0" step="0.01" value={f.cost ?? ''} onChange={set('cost')} />
      </div>
      <Input label="Notes" value={f.notes ?? ''} onChange={set('notes')} />
      <button type="submit" className="w-full rounded-lg bg-brand-600 py-2 text-sm font-medium text-white">
        Add event
      </button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export function Bookings({
  trips,
  bookings,
  selectedTripId,
  onSelectTrip,
  onAdd,
  onDelete,
  seedMode,
}: Props) {
  const trip = trips.find((t) => t.id === selectedTripId) ?? null
  const [adding, setAdding] = useState<BookingKind | null>(null)
  const [busy, setBusy] = useState(false)

  const grouped = useMemo(() => {
    const g: Record<BookingKind, Booking[]> = { flight: [], hotel: [], event: [] }
    for (const b of bookings) g[b.kind].push(b)
    // New entries slot into time order automatically.
    const byTime = (k: BookingKind) => (a: Booking, b: Booking) => {
      const ka = k === 'flight' ? a.depart_at : k === 'hotel' ? a.check_in : a.start_at
      const kb = k === 'flight' ? b.depart_at : k === 'hotel' ? b.check_in : b.start_at
      return (ka ?? '~~~') < (kb ?? '~~~') ? -1 : 1
    }
    ;(Object.keys(g) as BookingKind[]).forEach((k) => g[k].sort(byTime(k)))
    return g
  }, [bookings])

  const add = async (body: Partial<Booking>) => {
    if (!trip) return
    setBusy(true)
    try {
      await onAdd(trip.id, body)
    } finally {
      setBusy(false)
    }
  }

  const title = adding === 'flight' ? 'Add flight' : adding === 'hotel' ? 'Add hotel' : 'Add event'

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

      {trip && (
        <div className="mb-4 flex flex-wrap gap-2">
          {(['flight', 'hotel', 'event'] as BookingKind[]).map((k) => (
            <button
              key={k}
              onClick={() => setAdding(k)}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white"
            >
              <Plus className="h-4 w-4" /> Add {k}
            </button>
          ))}
        </div>
      )}

      {!trip && (
        <p className="text-sm text-slate-500">Pick a trip to see its bookings.</p>
      )}

      {trip && (
        <div className="space-y-5">
          {seedMode && (
            <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
              Sample data is read-only here — add/edit applies to real trips only.
            </p>
          )}
          {(Object.keys(KIND_LABEL) as BookingKind[]).map((kind) => (
            <section key={kind}>
              <h3 className="mb-2 text-sm font-semibold text-slate-700">
                {KIND_LABEL[kind]}
              </h3>
              {grouped[kind].length === 0 && (
                <p className="text-xs text-slate-400">None yet.</p>
              )}
              <div className="space-y-2">
                {grouped[kind].map((b) => (
                  <div key={b.id} className="rounded-lg bg-white p-3 shadow-sm">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">
                        {CATEGORY_EMOJI[b.category] ?? '📌'} {b.title}
                      </p>
                      {!seedMode && (
                        <button
                          onClick={() => void onDelete(b)}
                          aria-label="Delete booking"
                          className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    {b.kind === 'flight' && <FlightCard b={b} trip={trip} />}
                    {b.kind === 'hotel' && <HotelCard b={b} />}
                    {b.kind === 'event' && <EventCard b={b} trip={trip} />}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {adding && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">{title}</h3>
              <button
                onClick={() => setAdding(null)}
                aria-label="Close"
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {busy ? (
              <p className="py-8 text-center text-sm text-slate-500">Saving…</p>
            ) : (
              <>
                {adding === 'flight' && (
                  <FlightForm onSubmit={add} onClose={() => setAdding(null)} />
                )}
                {adding === 'hotel' && (
                  <HotelForm onSubmit={add} onClose={() => setAdding(null)} />
                )}
                {adding === 'event' && (
                  <EventForm onSubmit={add} onClose={() => setAdding(null)} />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
