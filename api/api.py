"""Travel-service backend: FastAPI app for the barebones travel app.

Entry points:
- Local dev: `uvicorn api:app` (see scripts/local-dev.sh)
- AWS Lambda: lambda_handler.py wraps this app with Mangum.
"""
import hashlib
import logging
import os
import secrets
from datetime import date, datetime, timezone

from dotenv import load_dotenv
from fastapi import Body, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from supabase import Client, create_client
from supabase_auth.errors import AuthApiError

from pacing import trip_pacing
from parser import parse_booking_email

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("travel-service")

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SECRET_KEY = os.environ.get("SUPABASE_SECRET_KEY")

app = FastAPI(title="travel-service")

# CORS: only the web app origin(s) may call this API from a browser.
_web_origins = os.environ.get("WEB_ORIGINS", "")
CORS_ORIGINS = [o.strip() for o in _web_origins.split(",") if o.strip()] or [
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

_client: Client | None = None


def get_supabase() -> Client:
    """Supabase client (secret key). Lazily built so module import works
    without env vars set (tests, Docker build)."""
    global _client
    if _client is None:
        if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
            raise HTTPException(
                status_code=500,
                detail="server misconfigured: SUPABASE_URL / SUPABASE_SECRET_KEY not set",
            )
        _client = create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)
    return _client


def _auth(authorization: str | None) -> str:
    """Verify the Supabase JWT and return the user id, else 401."""
    if not authorization:
        raise HTTPException(status_code=401, detail="missing access token")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        uid = get_supabase().auth.get_user(token).user.id
    except AuthApiError:
        logger.warning("access token rejected", exc_info=True)
        uid = None
    except Exception:
        logger.warning("auth service unreachable", exc_info=True)
        raise HTTPException(
            status_code=503, detail="auth service unreachable — try again"
        ) from None
    if not uid:
        raise HTTPException(status_code=401, detail="invalid access token")
    return str(uid)


def _auth_user(authorization: str | None, x_api_key: str | None) -> str:
    """Return the user id from a Supabase JWT or a travel API key, else 401.

    API keys are created via POST /users/me/api-keys and passed as the
    X-API-Key header. They enable script/JSON access without an
    interactive login.
    """
    if x_api_key:
        key_hash = hashlib.sha256(x_api_key.encode()).hexdigest()
        rows = (
            get_supabase()
            .table("travel_api_keys")
            .select("user_id")
            .eq("key_hash", key_hash)
            .limit(1)
            .execute()
            .data
        )
        if not rows:
            raise HTTPException(status_code=401, detail="invalid API key")
        uid = str(rows[0]["user_id"])
        try:
            get_supabase().table("travel_api_keys").update(
                {"last_used_at": datetime.now(timezone.utc).isoformat()}
            ).eq("key_hash", key_hash).execute()
        except Exception:
            logger.warning("failed to touch api key last_used_at", exc_info=True)
        return uid
    return _auth(authorization)


def _member_role(trip_id: str, uid: str) -> str | None:
    rows = (
        get_supabase()
        .table("travel_trip_members")
        .select("role")
        .eq("trip_id", trip_id)
        .eq("user_id", uid)
        .limit(1)
        .execute()
        .data
    )
    return rows[0]["role"] if rows else None


def _trip_access(trip_id: str, uid: str) -> dict:
    """Return the trip if uid may read it, else 404.

    Legacy trips (owner_id NULL) stay visible to any authenticated user
    until claimed.
    """
    trip = _row_or_404("travel_trips", trip_id)
    if trip.get("owner_id") is None:
        return trip
    if str(trip["owner_id"]) == uid:
        return trip
    if _member_role(trip_id, uid):
        return trip
    raise HTTPException(status_code=404, detail="travel_trips row not found")


def _require_editor(trip_id: str, uid: str) -> dict:
    """Return the trip if uid may modify its contents, else 403/404."""
    trip = _trip_access(trip_id, uid)
    if trip.get("owner_id") is None:
        return trip
    if str(trip["owner_id"]) == uid:
        return trip
    if _member_role(trip_id, uid) in ("owner", "editor"):
        return trip
    raise HTTPException(status_code=403, detail="editor access required")


def _require_owner(trip_id: str, uid: str) -> dict:
    """Return the trip if uid owns it, else 403/404."""
    trip = _trip_access(trip_id, uid)
    if trip.get("owner_id") is None:
        raise HTTPException(status_code=409, detail="trip has no owner yet — claim it first")
    if str(trip["owner_id"]) == uid:
        return trip
    if _member_role(trip_id, uid) == "owner":
        return trip
    raise HTTPException(status_code=403, detail="owner access required")


def _find_user_id_by_email(email: str) -> str | None:
    """Resolve a Supabase user id by email via the admin API."""
    try:
        resp = get_supabase().auth.admin.list_users()
        users = resp.users if hasattr(resp, "users") else resp
        for u in users or []:
            if (getattr(u, "email", "") or "").lower() == email.lower():
                return str(u.id)
    except Exception:
        logger.warning("admin user lookup failed", exc_info=True)
    return None


def _row_or_404(table: str, row_id: str) -> dict:
    rows = get_supabase().table(table).select("*").eq("id", row_id).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail=f"{table} row not found")
    return rows[0]


def _trip_or_404(trip_id: str) -> dict:
    return _row_or_404("travel_trips", trip_id)


@app.get("/health")
def health():
    return {"status": "ok"}


# ── Trips ────────────────────────────────────────────────────────────────


@app.get("/trips")
def list_trips(authorization: str = Header(None),
    x_api_key: str = Header(None, alias="X-API-Key")):
    uid = _auth_user(authorization, x_api_key)
    supabase = get_supabase()
    trips = (
        supabase.table("travel_trips")
        .select("*")
        .order("start_date", desc=False)
        .execute()
        .data
        or []
    )
    member_rows = (
        supabase.table("travel_trip_members")
        .select("trip_id")
        .eq("user_id", uid)
        .execute()
        .data
        or []
    )
    member_ids = {r["trip_id"] for r in member_rows}
    # Legacy trips (owner_id NULL) stay visible to all authenticated users
    # until claimed; otherwise only the owner and members see the trip.
    return [
        t
        for t in trips
        if t.get("owner_id") is None
        or str(t.get("owner_id")) == uid
        or t["id"] in member_ids
    ]


@app.post("/trips")
def create_trip(payload: dict = Body(...), authorization: str = Header(None),
    x_api_key: str = Header(None, alias="X-API-Key")):
    uid = _auth_user(authorization, x_api_key)
    allowed = {"name", "destination", "destination_tz", "home_tz",
               "start_date", "end_date", "notes"}
    row = {k: v for k, v in payload.items() if k in allowed}
    row["owner_id"] = uid
    supabase = get_supabase()
    data = supabase.table("travel_trips").insert(row).execute().data
    trip = data[0]
    supabase.table("travel_trip_members").upsert(
        {"trip_id": trip["id"], "user_id": uid, "role": "owner"},
        on_conflict="trip_id,user_id",
    ).execute()
    return trip


@app.get("/trips/{trip_id}")
def get_trip(trip_id: str, authorization: str = Header(None),
    x_api_key: str = Header(None, alias="X-API-Key")):
    uid = _auth_user(authorization, x_api_key)
    return _trip_access(trip_id, uid)


@app.patch("/trips/{trip_id}")
def update_trip(trip_id: str, payload: dict = Body(...), authorization: str = Header(None),
    x_api_key: str = Header(None, alias="X-API-Key")):
    uid = _auth_user(authorization, x_api_key)
    _require_editor(trip_id, uid)
    allowed = {"name", "destination", "destination_tz", "home_tz",
               "start_date", "end_date", "notes"}
    row = {k: v for k, v in payload.items() if k in allowed}
    if not row:
        raise HTTPException(status_code=400, detail="nothing to update")
    data = (
        get_supabase().table("travel_trips").update(row).eq("id", trip_id).execute().data
    )
    return data[0]


@app.delete("/trips/{trip_id}")
def delete_trip(trip_id: str, authorization: str = Header(None),
    x_api_key: str = Header(None, alias="X-API-Key")):
    uid = _auth_user(authorization, x_api_key)
    _require_owner(trip_id, uid)
    get_supabase().table("travel_trips").delete().eq("id", trip_id).execute()
    return {"deleted": True}


# ── Trip ownership & sharing ─────────────────────────────────────────


@app.post("/trips/{trip_id}/claim")
def claim_trip(trip_id: str,
    authorization: str = Header(None),
    x_api_key: str = Header(None, alias="X-API-Key")):
    """Claim an ownerless (legacy) trip: caller becomes its owner."""
    uid = _auth_user(authorization, x_api_key)
    trip = _row_or_404("travel_trips", trip_id)
    if trip.get("owner_id") is not None:
        raise HTTPException(status_code=409, detail="trip already has an owner")
    supabase = get_supabase()
    supabase.table("travel_trips").update({"owner_id": uid}).eq("id", trip_id).execute()
    supabase.table("travel_trip_members").upsert(
        {"trip_id": trip_id, "user_id": uid, "role": "owner"},
        on_conflict="trip_id,user_id",
    ).execute()
    return supabase.table("travel_trips").select("*").eq("id", trip_id).execute().data[0]


@app.get("/trips/{trip_id}/members")
def list_members(trip_id: str,
    authorization: str = Header(None),
    x_api_key: str = Header(None, alias="X-API-Key")):
    uid = _auth_user(authorization, x_api_key)
    trip = _trip_access(trip_id, uid)
    rows = (
        get_supabase().table("travel_trip_members").select("*")
        .eq("trip_id", trip_id).order("created_at").execute().data
        or []
    )
    return {"owner_id": trip.get("owner_id"), "members": rows}


@app.post("/trips/{trip_id}/members")
def add_member(trip_id: str, payload: dict = Body(...),
    authorization: str = Header(None),
    x_api_key: str = Header(None, alias="X-API-Key")):
    """Share a trip: owner invites by email. The person must already have
    an account (sign up / Google sign-in first)."""
    uid = _auth_user(authorization, x_api_key)
    _require_owner(trip_id, uid)
    email = (payload.get("email") or "").strip()
    role = payload.get("role") or "viewer"
    if not email:
        raise HTTPException(status_code=400, detail="email is required")
    if role not in ("editor", "viewer"):
        raise HTTPException(status_code=400, detail="role must be editor or viewer")
    member_id = _find_user_id_by_email(email)
    if not member_id:
        raise HTTPException(
            status_code=404,
            detail="no account found for that email — ask them to create one first",
        )
    data = (
        get_supabase().table("travel_trip_members").upsert(
            {"trip_id": trip_id, "user_id": member_id, "email": email, "role": role},
            on_conflict="trip_id,user_id",
        ).execute().data
    )
    return data[0]


@app.delete("/trips/{trip_id}/members/{member_id}")
def remove_member(trip_id: str, member_id: str,
    authorization: str = Header(None),
    x_api_key: str = Header(None, alias="X-API-Key")):
    uid = _auth_user(authorization, x_api_key)
    trip = _require_owner(trip_id, uid)
    if str(trip.get("owner_id")) == member_id:
        raise HTTPException(status_code=400, detail="cannot remove the trip owner")
    get_supabase().table("travel_trip_members").delete().eq(
        "trip_id", trip_id).eq("user_id", member_id).execute()
    return {"deleted": True}


# ── API keys (script/JSON access) ────────────────────────────────────


@app.get("/users/me/api-keys")
def list_api_keys(
    authorization: str = Header(None),
    x_api_key: str = Header(None, alias="X-API-Key"),
):
    uid = _auth_user(authorization, x_api_key)
    rows = (
        get_supabase().table("travel_api_keys")
        .select("id, name, created_at, last_used_at")
        .eq("user_id", uid).order("created_at", desc=True).execute().data
        or []
    )
    return rows


@app.post("/users/me/api-keys")
def create_api_key(payload: dict = Body(...),
    authorization: str = Header(None),
    x_api_key: str = Header(None, alias="X-API-Key")):
    """Create an API key. The plaintext key is returned ONCE — store it
    somewhere safe (it is only stored hashed server-side)."""
    uid = _auth_user(authorization, x_api_key)
    name = (payload.get("name") or "api key").strip() or "api key"
    raw = "trk_" + secrets.token_urlsafe(32)
    key_hash = hashlib.sha256(raw.encode()).hexdigest()
    data = (
        get_supabase().table("travel_api_keys")
        .insert({"user_id": uid, "name": name, "key_hash": key_hash})
        .execute().data
    )
    row = data[0]
    return {
        "id": row["id"],
        "name": row["name"],
        "key": raw,
        "created_at": row["created_at"],
    }


@app.delete("/users/me/api-keys/{key_id}")
def delete_api_key(key_id: str,
    authorization: str = Header(None),
    x_api_key: str = Header(None, alias="X-API-Key")):
    uid = _auth_user(authorization, x_api_key)
    get_supabase().table("travel_api_keys").delete().eq(
        "id", key_id).eq("user_id", uid).execute()
    return {"deleted": True}


# ── Bookings ─────────────────────────────────────────────────────────────


BOOKING_FIELDS = {
    "kind", "category", "title",
    "airline", "flight_number", "origin", "destination",
    "depart_at", "arrive_at", "points_cost", "point_currency",
    "cash_paid", "cash_currency", "booking_account",
    "confirmation_number", "ticket_number", "seat", "checked_bags",
    "change_cancel_deadline", "cents_per_point",
    "hotel_name", "address", "check_in", "check_out",
    "room_type", "free_night_certs", "resort_fees", "cancellation_deadline",
    "location", "maps_url", "start_at", "end_at", "cost", "notes",
}


@app.get("/trips/{trip_id}/bookings")
def list_bookings(trip_id: str, authorization: str = Header(None),
    x_api_key: str = Header(None, alias="X-API-Key")):
    uid = _auth_user(authorization, x_api_key)
    _trip_access(trip_id, uid)
    rows = (
        get_supabase()
        .table("travel_bookings")
        .select("*")
        .eq("trip_id", trip_id)
        .order("created_at")
        .execute()
        .data
    )
    return rows or []


@app.post("/trips/{trip_id}/bookings")
def create_booking(trip_id: str, payload: dict = Body(...), authorization: str = Header(None),
    x_api_key: str = Header(None, alias="X-API-Key")):
    uid = _auth_user(authorization, x_api_key)
    _require_editor(trip_id, uid)
    row = {k: v for k, v in payload.items() if k in BOOKING_FIELDS}
    row["trip_id"] = trip_id
    data = get_supabase().table("travel_bookings").insert(row).execute().data
    return data[0]


@app.post("/trips/{trip_id}/bookings/bulk")
def bulk_create_bookings(trip_id: str, payload: dict = Body(...),
    authorization: str = Header(None),
    x_api_key: str = Header(None, alias="X-API-Key")):
    """Create many bookings in one call — the JSON import path.

    Body: {"bookings": [ {booking fields...}, ... ]}.
    Unknown fields are ignored; every booking gets the trip's id.
    """
    uid = _auth_user(authorization, x_api_key)
    _require_editor(trip_id, uid)
    items = payload.get("bookings")
    if not isinstance(items, list) or not items:
        raise HTTPException(status_code=400, detail="bookings must be a non-empty list")
    rows = []
    for item in items:
        if not isinstance(item, dict):
            raise HTTPException(status_code=400, detail="each booking must be an object")
        row = {k: v for k, v in item.items() if k in BOOKING_FIELDS}
        row["trip_id"] = trip_id
        rows.append(row)
    data = get_supabase().table("travel_bookings").insert(rows).execute().data
    return {"created": len(data or []), "bookings": data or []}


@app.patch("/bookings/{booking_id}")
def update_booking(booking_id: str, payload: dict = Body(...), authorization: str = Header(None),
    x_api_key: str = Header(None, alias="X-API-Key")):
    uid = _auth_user(authorization, x_api_key)
    booking = _row_or_404("travel_bookings", booking_id)
    _require_editor(booking["trip_id"], uid)
    row = {k: v for k, v in payload.items() if k in BOOKING_FIELDS}
    if not row:
        raise HTTPException(status_code=400, detail="nothing to update")
    data = (
        get_supabase()
        .table("travel_bookings")
        .update(row)
        .eq("id", booking_id)
        .execute()
        .data
    )
    return data[0]


@app.delete("/bookings/{booking_id}")
def delete_booking(booking_id: str, authorization: str = Header(None),
    x_api_key: str = Header(None, alias="X-API-Key")):
    uid = _auth_user(authorization, x_api_key)
    booking = _row_or_404("travel_bookings", booking_id)
    _require_editor(booking["trip_id"], uid)
    get_supabase().table("travel_bookings").delete().eq("id", booking_id).execute()
    return {"deleted": True}


# ── Expenses ─────────────────────────────────────────────────────────────


EXPENSE_FIELDS = {"date", "amount", "currency", "category", "note", "source"}


@app.get("/trips/{trip_id}/expenses")
def list_expenses(trip_id: str, authorization: str = Header(None),
    x_api_key: str = Header(None, alias="X-API-Key")):
    uid = _auth_user(authorization, x_api_key)
    _trip_access(trip_id, uid)
    rows = (
        get_supabase()
        .table("travel_expenses")
        .select("*")
        .eq("trip_id", trip_id)
        .order("date")
        .execute()
        .data
    )
    return rows or []


@app.post("/trips/{trip_id}/expenses")
def create_expense(trip_id: str, payload: dict = Body(...), authorization: str = Header(None),
    x_api_key: str = Header(None, alias="X-API-Key")):
    uid = _auth_user(authorization, x_api_key)
    _require_editor(trip_id, uid)
    row = {k: v for k, v in payload.items() if k in EXPENSE_FIELDS}
    row["trip_id"] = trip_id
    if not row.get("date") or row.get("amount") is None:
        raise HTTPException(status_code=400, detail="date and amount are required")
    data = get_supabase().table("travel_expenses").insert(row).execute().data
    return data[0]


@app.delete("/expenses/{expense_id}")
def delete_expense(expense_id: str, authorization: str = Header(None),
    x_api_key: str = Header(None, alias="X-API-Key")):
    uid = _auth_user(authorization, x_api_key)
    expense = _row_or_404("travel_expenses", expense_id)
    _require_editor(expense["trip_id"], uid)
    get_supabase().table("travel_expenses").delete().eq("id", expense_id).execute()
    return {"deleted": True}


# ── Budget + pacing ──────────────────────────────────────────────────────


def _budget_pacing_response(trip: dict, budget: dict | None) -> dict:
    """fixed_costs = sum of flight/hotel booking cash amounts; expenses grouped
    by date → pacing math (pacing.py, pure)."""
    supabase = get_supabase()
    bookings = (
        supabase.table("travel_bookings")
        .select("kind, cash_paid, resort_fees")
        .eq("trip_id", trip["id"])
        .execute()
        .data
        or []
    )
    expenses = (
        supabase.table("travel_expenses")
        .select("date, amount")
        .eq("trip_id", trip["id"])
        .execute()
        .data
        or []
    )
    fixed = sum(float(b.get("cash_paid") or 0) for b in bookings)
    fixed += sum(float(b.get("resort_fees") or 0) for b in bookings
                 if b.get("kind") == "hotel")
    by_date: dict[str, float] = {}
    for e in expenses:
        by_date[e["date"]] = by_date.get(e["date"], 0.0) + float(e["amount"])

    total = float(budget["total_budget"]) if budget else 0.0
    pacing = None
    if trip.get("start_date") and trip.get("end_date") and total > 0:
        pacing = trip_pacing(
            total,
            fixed,
            date.fromisoformat(trip["start_date"]),
            date.fromisoformat(trip["end_date"]),
            by_date,
        )
    return {
        "budget": budget,
        "fixed_costs": fixed,
        "pacing": pacing,
    }


@app.get("/trips/{trip_id}/budget")
def get_budget(trip_id: str, authorization: str = Header(None),
    x_api_key: str = Header(None, alias="X-API-Key")):
    uid = _auth_user(authorization, x_api_key)
    trip = _trip_access(trip_id, uid)
    rows = (
        get_supabase()
        .table("travel_budgets")
        .select("*")
        .eq("trip_id", trip_id)
        .limit(1)
        .execute()
        .data
    )
    return _budget_pacing_response(trip, rows[0] if rows else None)


@app.put("/trips/{trip_id}/budget")
def put_budget(trip_id: str, payload: dict = Body(...), authorization: str = Header(None),
    x_api_key: str = Header(None, alias="X-API-Key")):
    uid = _auth_user(authorization, x_api_key)
    trip = _require_editor(trip_id, uid)
    if payload.get("total_budget") is None:
        raise HTTPException(status_code=400, detail="total_budget is required")
    supabase = get_supabase()
    row = {
        "trip_id": trip_id,
        "total_budget": payload["total_budget"],
        "currency": payload.get("currency") or "USD",
    }
    data = (
        supabase.table("travel_budgets")
        .upsert(row, on_conflict="trip_id")
        .execute()
        .data
    )
    return _budget_pacing_response(trip, data[0])


# ── Import queue ─────────────────────────────────────────────────────────


@app.get("/import-queue")
def list_import_queue(authorization: str = Header(None),
    x_api_key: str = Header(None, alias="X-API-Key")):
    _auth_user(authorization, x_api_key)
    rows = (
        get_supabase()
        .table("travel_import_queue")
        .select("*")
        .eq("status", "draft")
        .order("created_at", desc=True)
        .execute()
        .data
    )
    return rows or []


@app.post("/import-queue/{queue_id}/confirm")
def confirm_import(queue_id: str, payload: dict = Body(...), authorization: str = Header(None),
    x_api_key: str = Header(None, alias="X-API-Key")):
    """Create a booking from a queue draft and mark the draft confirmed."""
    uid = _auth_user(authorization, x_api_key)
    draft = _row_or_404("travel_import_queue", queue_id)
    trip_id = payload.get("trip_id")
    if not trip_id:
        raise HTTPException(status_code=400, detail="trip_id is required")
    _require_editor(trip_id, uid)

    parsed = draft.get("parsed_json") or {}
    booking = {k: v for k, v in parsed.items() if k in BOOKING_FIELDS}
    booking["trip_id"] = trip_id
    if not booking.get("kind"):
        booking["kind"] = "flight"
    created = get_supabase().table("travel_bookings").insert(booking).execute().data[0]

    get_supabase().table("travel_import_queue").update(
        {"status": "confirmed", "trip_id": trip_id,
         "reviewed_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", queue_id).execute()
    return created


@app.post("/import-queue/{queue_id}/discard")
def discard_import(queue_id: str, authorization: str = Header(None),
    x_api_key: str = Header(None, alias="X-API-Key")):
    _auth_user(authorization, x_api_key)
    _row_or_404("travel_import_queue", queue_id)
    get_supabase().table("travel_import_queue").update(
        {"status": "discarded",
         "reviewed_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", queue_id).execute()
    return {"status": "discarded"}


# ── Manual email refresh ─────────────────────────────────────────────────

#: Fields that make an email count as "looks like a booking" rather than junk.
BOOKING_CONFIDENCE_FIELDS = {"confirmation_number", "flight_number", "segments"}


@app.post("/refresh")
def refresh(payload: dict = Body(...), authorization: str = Header(None),
    x_api_key: str = Header(None, alias="X-API-Key")):
    """Manual refresh hook: accept a raw email (read from Gmail by the user's
    agent — Gmail reading itself is NOT done by this service), run the
    parser, and store a review-queue draft when it looks like a booking."""
    _auth_user(authorization, x_api_key)
    result = parse_booking_email(
        subject=payload.get("subject") or "",
        sender=payload.get("from") or "",
        body_text=payload.get("body_text") or "",
        body_html=payload.get("body_html"),
    )
    status = result["status"]
    stored = None
    looks_like_booking = (
        status == "parsed"
        or any(f in result["fields"] for f in BOOKING_CONFIDENCE_FIELDS)
    )
    if looks_like_booking:
        rows = (
            get_supabase()
            .table("travel_import_queue")
            .insert({
                "raw_subject": payload.get("subject") or "",
                "raw_from": payload.get("from") or "",
                "parsed_json": result["fields"],
                "missing_fields": result["missing_fields"],
            })
            .execute()
            .data
        )
        stored = rows[0]["id"] if rows else None
        logger.info("import queue draft stored", extra={"queue_id": stored, "status": status})
    return {
        "status": status,
        "booking_draft": result["fields"],
        "missing_fields": result["missing_fields"],
        "queue_id": stored,
    }
