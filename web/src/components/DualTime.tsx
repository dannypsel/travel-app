import type { Trip } from '@/types'
import { formatDualTz, formatDualTzTime } from '@/lib/tz'
import { DEFAULT_HOME_TZ } from '@/types'

interface Props {
  iso: string
  trip: Trip
  /** 'full' = "Mar 15, 3:30 PM JST · Mar 15, 11:30 PM PDT"; 'time' = times only */
  mode?: 'full' | 'time'
}

/** A timestamp rendered in BOTH the destination tz and home (PST) tz. */
export function DualTime({ iso, trip, mode = 'full' }: Props) {
  const homeTz = trip.home_tz || DEFAULT_HOME_TZ
  const text =
    mode === 'full'
      ? formatDualTz(iso, trip.destination_tz, homeTz)
      : formatDualTzTime(iso, trip.destination_tz, homeTz)
  return <span className="tabular-nums">{text}</span>
}
