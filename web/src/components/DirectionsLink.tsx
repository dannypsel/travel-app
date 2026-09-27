// Small "Directions" link for a booking. Renders nothing when the booking
// has no mappable location.

import { directionsUrl } from '@/lib/maps'
import type { Booking } from '@/types'

export function DirectionsLink({
  booking,
  className,
}: {
  booking: Booking
  className?: string
}) {
  const url = directionsUrl(booking)
  if (!url) return null
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={className ?? 'text-brand-600 hover:underline'}
    >
      Directions ↗
    </a>
  )
}
