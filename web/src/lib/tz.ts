// Timezone helpers — all display goes through Intl.DateTimeFormat with
// explicit timeZone. No date library.

/** YYYY-MM-DD -> Date at noon UTC (avoids tz-shift on date-only values). */
export function parseDateOnly(yyyyMmDd: string): Date {
  return new Date(`${yyyyMmDd}T12:00:00Z`)
}

/** Date -> YYYY-MM-DD. */
export function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Add n days to a YYYY-MM-DD date string. */
export function addDays(yyyyMmDd: string, n: number): string {
  const d = parseDateOnly(yyyyMmDd)
  d.setUTCDate(d.getUTCDate() + n)
  return toDateOnly(d)
}

/** YYYY-MM-DD -> "Mar 15" (tz-independent). */
export function formatShortDate(yyyyMmDd: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(parseDateOnly(yyyyMmDd))
}

/** YYYY-MM-DD -> "Mar 15, 2026" (tz-independent). */
export function formatLongDate(yyyyMmDd: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parseDateOnly(yyyyMmDd))
}

/** Weekday name for a YYYY-MM-DD date string. */
export function weekday(yyyyMmDd: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  }).format(parseDateOnly(yyyyMmDd))
}

/**
 * Format an ISO timestamp in a single timezone, e.g. "Mar 15, 3:30 PM".
 */
export function formatInTz(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(new Date(iso))
}

/**
 * Dual-timezone display: every timestamp shown in BOTH the destination
 * timezone and home (PST). Example:
 * "Mar 15, 3:30 PM JST · Mar 15, 11:30 PM PDT"
 */
export function formatDualTz(
  iso: string,
  destTz: string,
  homeTz: string,
): string {
  const dest = formatInTz(iso, destTz)
  const home = formatInTz(iso, homeTz)
  const destAbbr = tzAbbr(iso, destTz)
  const homeAbbr = tzAbbr(iso, homeTz)
  return `${dest} ${destAbbr} · ${home} ${homeAbbr}`
}

/** Time-only dual display, e.g. "3:30 PM JST · 11:30 PM PDT". */
export function formatDualTzTime(iso: string, destTz: string, homeTz: string): string {
  const opts = {
    hour: 'numeric' as const,
    minute: '2-digit' as const,
  }
  const dest = new Intl.DateTimeFormat('en-US', {
    ...opts,
    timeZone: destTz,
  }).format(new Date(iso))
  const home = new Intl.DateTimeFormat('en-US', {
    ...opts,
    timeZone: homeTz,
  }).format(new Date(iso))
  return `${dest} ${tzAbbr(iso, destTz)} · ${home} ${tzAbbr(iso, homeTz)}`
}

/** Short zone abbreviation like JST / PDT / PST. */
function tzAbbr(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZoneName: 'short',
    timeZone,
  }).formatToParts(new Date(iso))
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
}

/** Inclusive number of days between two YYYY-MM-DD dates. */
export function daysBetweenInclusive(start: string, end: string): number {
  const ms = parseDateOnly(end).getTime() - parseDateOnly(start).getTime()
  return Math.max(1, Math.round(ms / 86400000) + 1)
}
