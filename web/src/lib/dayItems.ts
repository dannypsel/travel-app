// Maps bookings onto trip days for the timeline / daily plan.
// All day assignment uses the trip's destination timezone.

import type { Booking, Trip } from '@/types'

export interface DayItem {
  day: string // YYYY-MM-DD in destination tz
  sortKey: string // for time ordering within a day
  booking: Booking
  when: string | null // ISO timestamp to display (dual tz), or null
  suffix: string // e.g. "(arrives)" / "(check-out)"
}

/** YYYY-MM-DD of an ISO timestamp in the given timezone. */
export function dayOfIsoInTz(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).formatToParts(new Date(iso))
  const y = parts.find((p) => p.type === 'year')!.value
  const m = parts.find((p) => p.type === 'month')!.value
  const d = parts.find((p) => p.type === 'day')!.value
  return `${y}-${m}-${d}`
}

function item(
  day: string,
  sortKey: string,
  booking: Booking,
  when: string | null,
  suffix = '',
): DayItem {
  return { day, sortKey, booking, when, suffix }
}

export function bookingDayItems(b: Booking, trip: Trip): DayItem[] {
  const tz = trip.destination_tz
  const out: DayItem[] = []

  if (b.kind === 'flight') {
    const primary = b.depart_at ?? b.arrive_at
    if (primary) {
      out.push(item(dayOfIsoInTz(primary, tz), primary, b, b.depart_at))
      if (b.arrive_at && b.depart_at) {
        const arrDay = dayOfIsoInTz(b.arrive_at, tz)
        if (arrDay !== dayOfIsoInTz(b.depart_at, tz)) {
          out.push(item(arrDay, b.arrive_at, b, b.arrive_at, '(arrives)'))
        }
      }
    } else if (b.check_in || b.check_out) {
      // shouldn't happen for flights; ignore
    } else {
      out.push(item(trip.start_date, '99', b, null))
    }
  } else if (b.kind === 'hotel') {
    if (b.check_in) out.push(item(b.check_in, '15:00', b, null))
    if (b.check_out && b.check_out !== b.check_in) {
      out.push(item(b.check_out, '11:00', b, null, '(check-out)'))
    }
    if (!b.check_in && !b.check_out) out.push(item(trip.start_date, '99', b, null))
  } else {
    // event
    const at = b.start_at ?? b.end_at
    if (at) out.push(item(dayOfIsoInTz(at, tz), at, b, b.start_at))
    else out.push(item(trip.start_date, '99', b, null))
  }

  return out
}

/** All day items for a trip, grouped by day (ascending), items in time order. */
export function tripTimeline(
  bookings: Booking[],
  trip: Trip,
): { day: string; items: DayItem[] }[] {
  const byDay = new Map<string, DayItem[]>()
  for (const b of bookings) {
    for (const it of bookingDayItems(b, trip)) {
      const list = byDay.get(it.day) ?? []
      list.push(it)
      byDay.set(it.day, list)
    }
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, items]) => ({
      day,
      items: items.sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1)),
    }))
}
