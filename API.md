# Travel App API — script/JSON access

Base URL: `https://sxj1rkmxzl.execute-api.us-east-1.amazonaws.com`

All endpoints below accept **either**:
- `Authorization: Bearer <supabase JWT>` (interactive login), or
- `X-API-Key: <api key>` (scripts, automation — no login needed)

Trips are owned by the account that created them. Only the owner and
members can see a trip; only the owner and `editor` members can change it.
Only the owner can share, remove members, or delete the trip.

## API keys

Create a key while logged in (one-time — the plaintext is shown only once):

```bash
curl -s -X POST $BASE/users/me/api-keys \
  -H "Authorization: Bearer $JWT" \
  -H 'Content-Type: application/json' \
  -d '{"name": "my-script"}'
# → {"id": "...", "name": "my-script", "key": "trk_...", "created_at": "..."}
```

List / revoke:

```bash
curl -s $BASE/users/me/api-keys -H "X-API-Key: $KEY"
curl -s -X DELETE $BASE/users/me/api-keys/<id> -H "X-API-Key: $KEY"
```

From here on, `KEY` = your API key, sent as `X-API-Key`.

## Trips

```bash
# list trips visible to you
curl -s $BASE/trips -H "X-API-Key: $KEY"

# create
curl -s -X POST $BASE/trips -H "X-API-Key: $KEY" \
  -H 'Content-Type: application/json' -d '{
    "name": "Tokyo + Seoul",
    "destination": "Tokyo",
    "destination_tz": "Asia/Tokyo",
    "home_tz": "America/Los_Angeles",
    "start_date": "2026-12-05",
    "end_date": "2026-12-27",
    "notes": "Japan / Shanghai / Harbin / Korea"
  }'

# update / delete
curl -s -X PATCH $BASE/trips/<id> -H "X-API-Key: $KEY" \
  -H 'Content-Type: application/json' -d '{"notes": "updated"}'
curl -s -X DELETE $BASE/trips/<id> -H "X-API-Key: $KEY"

# claim a legacy trip with no owner (becomes yours)
curl -s -X POST $BASE/trips/<id>/claim -H "X-API-Key: $KEY"
```

## Sharing

The other person must already have an account (email sign-up or Google).

```bash
# list members
curl -s $BASE/trips/<id>/members -H "X-API-Key: $KEY"

# share (role: editor or viewer)
curl -s -X POST $BASE/trips/<id>/members -H "X-API-Key: $KEY" \
  -H 'Content-Type: application/json' \
  -d '{"email": "sara@example.com", "role": "editor"}'

# remove
curl -s -X DELETE $BASE/trips/<id>/members/<user_id> -H "X-API-Key: $KEY"
```

## Bookings

Field reference (unknown fields are ignored):

- common: `kind` (flight|hotel|event), `title`, `confirmation_number`, `notes`
- flight: `airline`, `flight_number`, `origin`, `destination`, `depart_at`,
  `arrive_at`, `seat`, `ticket_number`, `checked_bags`, `booking_account`,
  `points_cost`, `point_currency`, `cash_paid`, `cash_currency`,
  `change_cancel_deadline`, `cents_per_point`
- hotel: `hotel_name`, `address`, `check_in`, `check_out`, `room_type`,
  `free_night_certs`, `resort_fees`, `cancellation_deadline`,
  `points_cost`, `point_currency`, `cash_paid`, `cash_currency`
- event: `location`, `maps_url`, `start_at`, `end_at`, `cost`

```bash
# add one booking
curl -s -X POST $BASE/trips/<id>/bookings -H "X-API-Key: $KEY" \
  -H 'Content-Type: application/json' -d '{
    "kind": "flight",
    "title": "AA 757 SEA → DFW",
    "airline": "American Airlines",
    "flight_number": "AA 757",
    "origin": "SEA", "destination": "DFW",
    "depart_at": "2026-11-06T15:41:00-08:00",
    "arrive_at": "2026-11-06T21:47:00-06:00",
    "seat": "20C",
    "confirmation_number": "HJTJOY",
    "points_cost": 21000, "point_currency": "American miles",
    "cash_paid": 11.20, "cash_currency": "USD",
    "booking_account": "Daniel"
  }'

# add many at once (the JSON import path)
curl -s -X POST $BASE/trips/<id>/bookings/bulk -H "X-API-Key: $KEY" \
  -H 'Content-Type: application/json' -d '{
    "bookings": [
      {"kind": "flight", "title": "AA 757 SEA → DFW", "...": "..."},
      {"kind": "hotel", "title": "Hyatt Place Dallas/Allen", "...": "..."}
    ]
  }'

# list / update / delete
curl -s $BASE/trips/<id>/bookings -H "X-API-Key: $KEY"
curl -s -X PATCH $BASE/bookings/<booking_id> -H "X-API-Key: $KEY" \
  -H 'Content-Type: application/json' -d '{"seat": "21C"}'
curl -s -X DELETE $BASE/bookings/<booking_id> -H "X-API-Key: $KEY"
```

## Expenses & budget

```bash
curl -s -X POST $BASE/trips/<id>/expenses -H "X-API-Key: $KEY" \
  -H 'Content-Type: application/json' \
  -d '{"date": "2026-11-07", "amount": 84.50, "category": "food", "note": "BBQ"}'
curl -s $BASE/trips/<id>/expenses -H "X-API-Key: $KEY"
curl -s -X DELETE $BASE/expenses/<expense_id> -H "X-API-Key: $KEY"

curl -s -X PUT $BASE/trips/<id>/budget -H "X-API-Key: $KEY" \
  -H 'Content-Type: application/json' -d '{"total_budget": 2500}'
curl -s $BASE/trips/<id>/budget -H "X-API-Key: $KEY"
```
