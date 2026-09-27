// Google Maps directions links for bookings.
// Priority: explicit maps_url override -> auto-generated from the booking's
// location fields (event location, hotel address/name, flight destination).

import type { Booking } from '@/types'

/** Directions URL for a booking, or null when there is no location to map. */
export function directionsUrl(b: Booking): string | null {
  if (b.maps_url) return b.maps_url
  const query =
    b.kind === 'event'
      ? b.location
      : b.kind === 'hotel'
        ? b.address ?? b.hotel_name
        : b.destination ?? b.origin
  if (!query) return null
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`
}
