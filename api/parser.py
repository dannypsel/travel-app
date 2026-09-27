"""Pure functions: parse airline confirmation emails into booking drafts.

Delta first (per spec); graceful fallback returns needs_review with whatever
was found plus a missing_fields list. No I/O, no side effects — safe to test.
"""
import re

# What a confident flight-booking parse must have to be "parsed".
REQUIRED_FLIGHT_FIELDS = (
    "confirmation_number",
    "passenger_name",
    "segments",
)


def _search(pattern: str, text: str, flags: int = 0) -> str | None:
    m = re.search(pattern, text, flags)
    return m.group(1).strip() if m else None


def parse_booking_email(
    subject: str,
    sender: str,
    body_text: str,
    body_html: str | None = None,
) -> dict:
    """Parse one confirmation email. Returns
    {status: "parsed"|"needs_review", fields: {...}, missing_fields: [...]}.

    `fields` doubles as the booking_draft the API stores in travel_import_queue
    (keys overlap the travel_bookings columns: kind, airline, flight_number,
    origin, destination, depart_at, arrive_at, confirmation_number,
    ticket_number, ...).
    """
    text = body_text or ""
    if not text and body_html:
        text = re.sub(r"<[^>]+>", " ", body_html or "")
        text = re.sub(r"\s+", " ", text)

    fields: dict = {}

    # ── Airline detection (Delta first) ──────────────────────────────
    haystack = f"{subject} {sender} {text}".lower()
    if "delta" in haystack or "delta.com" in sender.lower():
        fields["airline"] = "Delta"
        fields["kind"] = "flight"

    # ── Confirmation number ──────────────────────────────────────────
    conf = _search(
        r"(?i)(?:confirmation\s*(?:number|code|#)?|booking\s*reference|record\s*locator|pnr)\s*[:#]?\s*([A-Z0-9]{6})\b",
        text,
    )
    if conf:
        fields["confirmation_number"] = conf.upper()

    # ── Ticket number (13-digit e-ticket, Delta starts with 006) ──────
    ticket = _search(r"(?i)ticket\s*(?:number|#)?\s*[:#]?\s*(\d{13})", text)
    if ticket:
        fields["ticket_number"] = ticket

    # ── Passenger name ───────────────────────────────────────────────
    passenger = _search(r"(?i)passenger\s*(?:name)?\s*[:#]?\s*([A-Z][A-Z ,.'-]{2,60})", text)
    if passenger:
        fields["passenger_name"] = passenger.strip(" ,")

    # ── Flight segments: e.g. "DL 1234  ATL  JFK  08:15 AM  10:40 AM" ──
    # NOTE: no re.IGNORECASE on this pattern — the middle matcher is
    # [^A-Z0-9] so it can skip lowercase connector words like "from" while
    # the airport codes themselves must stay uppercase (avoids matching
    # arbitrary words like "from" as an airport code).
    segments = []
    for m in re.finditer(
        r"\b([A-Z]{2})\s*(\d{2,4})\b[^A-Z0-9]{0,60}?([A-Z]{3})\s*(?:to|TO|→|-|–)\s*([A-Z]{3})",
        text,
    ):
        code, num, orig, dest = m.group(1), m.group(2), m.group(3), m.group(4)
        # skip noise like "DL 1234" in unrelated phrases by requiring airport
        # codes of length 3 and a numeric flight number
        segments.append({
            "flight_number": f"{code.upper()}{num}",
            "origin": orig.upper(),
            "destination": dest.upper(),
        })
        if not fields.get("flight_number"):
            fields["flight_number"] = f"{code.upper()}{num}"
        if not fields.get("origin"):
            fields["origin"] = orig.upper()
        if not fields.get("destination"):
            fields["destination"] = dest.upper()
    if segments:
        fields["segments"] = segments

    # ── Depart/arrive datetimes on the first segment ─────────────────
    depart = _search(
        r"(?i)depart(?:s|ure)?\s*[:#]?\s*([A-Z][a-z]{2,8}\s+\d{1,2},?\s+\d{4}[^.]{0,20}?\d{1,2}:\d{2}\s*[AP]M)",
        text,
    )
    arrive = _search(
        r"(?i)arriv(?:es|al)?\s*[:#]?\s*([A-Z][a-z]{2,8}\s+\d{1,2},?\s+\d{4}[^.]{0,20}?\d{1,2}:\d{2}\s*[AP]M)",
        text,
    )
    if depart:
        fields["depart_at"] = depart
    if arrive:
        fields["arrive_at"] = arrive

    # ── Missing-fields audit ─────────────────────────────────────────
    missing_fields = [
        f for f in REQUIRED_FLIGHT_FIELDS if f not in fields
    ]
    # "flight_number"/"origin"/"destination" are convenience keys from the
    # first segment; if we have segments but the top-level keys got missed,
    # don't list them as missing.
    status = "parsed" if not missing_fields else "needs_review"

    return {
        "status": status,
        "fields": fields,
        "missing_fields": missing_fields,
    }
