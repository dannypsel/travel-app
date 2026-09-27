"""Light pytest coverage for the pacing math only (pacing.py)."""
from datetime import date

import pytest

from pacing import daily_allowance, trip_pacing


def test_daily_allowance_basic():
    # ($1000 budget − $200 fixed) ÷ 8 days = $100/day
    assert daily_allowance(1000, 200, 8) == 100.0


def test_daily_allowance_zero_fixed_costs():
    # No fixed costs → whole budget spread over the days
    assert daily_allowance(700, 0, 7) == 100.0


def test_daily_allowance_single_day():
    # One-day trip: the whole non-fixed budget is that day's allowance
    assert daily_allowance(500, 50, 1) == 450.0


def test_daily_allowance_min_days_guard():
    # num_days < 1 never divides by zero — clamped to 1
    assert daily_allowance(300, 0, 0) == 300.0
    assert daily_allowance(300, 0, -5) == 300.0


def test_trip_pacing_statuses():
    # $300 budget, $0 fixed, 3 days → $100/day allowance
    result = trip_pacing(
        300, 0, date(2026, 10, 1), date(2026, 10, 3),
        {
            "2026-10-01": 120.0,   # over
            "2026-10-02": 100.0,   # even
            "2026-10-03": 50.0,    # under
        },
    )
    assert result["daily_allowance"] == 100.0
    assert len(result["days"]) == 3
    assert [d["status"] for d in result["days"]] == ["over", "even", "under"]
    assert result["total_spent"] == 270.0
    assert result["remaining"] == 30.0
    assert result["days"][0]["spent"] == 120.0


def test_trip_pacing_day_without_expense_is_even_or_under():
    # $200 budget, $0 fixed, 2 days → $100/day; no spend on day 2 → under
    result = trip_pacing(200, 0, date(2026, 10, 1), date(2026, 10, 2), {})
    assert [d["status"] for d in result["days"]] == ["under", "under"]
    assert result["total_spent"] == 0.0
    assert result["remaining"] == 200.0


def test_trip_pacing_single_day_trip():
    # Single-day trip with fixed costs
    result = trip_pacing(
        500, 200, date(2026, 10, 1), date(2026, 10, 1),
        {date(2026, 10, 1): 300.0},
    )
    assert result["daily_allowance"] == 300.0
    assert len(result["days"]) == 1
    assert result["days"][0]["status"] == "even"
    assert result["remaining"] == 0.0


def test_trip_pacing_remaining_can_go_negative():
    # Overspending more than the budget leaves negative remaining
    result = trip_pacing(100, 0, date(2026, 10, 1), date(2026, 10, 1), {"2026-10-01": 150})
    assert result["days"][0]["status"] == "over"
    assert result["remaining"] == -50.0


def test_trip_pacing_accepts_date_objects_and_strings():
    # Expenses keyed by date objects or ISO strings both work
    result = trip_pacing(
        200, 0, date(2026, 10, 1), date(2026, 10, 2),
        {date(2026, 10, 1): 30.0, "2026-10-02": 40.0},
    )
    assert result["total_spent"] == 70.0


def test_trip_pacing_rejects_backwards_dates():
    with pytest.raises(ValueError):
        trip_pacing(100, 0, date(2026, 10, 5), date(2026, 10, 1), {})
