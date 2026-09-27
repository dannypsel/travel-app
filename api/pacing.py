"""Pure functions: trip-budget daily pacing math.

daily_allowance = (total_budget - fixed_costs) / num_days  (num_days >= 1)
fixed_costs = sum of flight/hotel fixed cash amounts (computed by the API
endpoint from bookings; the pure functions just take the number).
"""
from datetime import date, timedelta


def daily_allowance(total_budget: float, fixed_costs: float, num_days: int) -> float:
    """Per-day allowance for the non-fixed part of the budget."""
    days = max(int(num_days), 1)
    return (float(total_budget) - float(fixed_costs)) / days


def trip_pacing(
    total_budget: float,
    fixed_costs: float,
    start_date: date,
    end_date: date,
    expenses_by_date: dict,
) -> dict:
    """Per-day pacing for a trip.

    expenses_by_date: {date (date or ISO str): amount}
    Returns {daily_allowance, days:[{date, spent, allowance, status}],
             total_spent, remaining}.
    Status is 'over' if spent > allowance, 'under' if spent < allowance,
    'even' if exactly equal.
    """
    if end_date < start_date:
        raise ValueError("end_date must be on or after start_date")

    num_days = (end_date - start_date).days + 1
    allowance = daily_allowance(total_budget, fixed_costs, num_days)

    # Normalize expense keys to date objects.
    expenses: dict[date, float] = {}
    for key, amount in (expenses_by_date or {}).items():
        d = key if isinstance(key, date) else date.fromisoformat(str(key))
        expenses[d] = expenses.get(d, 0.0) + float(amount)

    days = []
    total_spent = 0.0
    for i in range(num_days):
        d = start_date + timedelta(days=i)
        spent = expenses.get(d, 0.0)
        total_spent += spent
        if spent > allowance:
            status = "over"
        elif spent < allowance:
            status = "under"
        else:
            status = "even"
        days.append({
            "date": d.isoformat(),
            "spent": spent,
            "allowance": allowance,
            "status": status,
        })

    return {
        "daily_allowance": allowance,
        "days": days,
        "total_spent": total_spent,
        "remaining": float(total_budget) - float(fixed_costs) - total_spent,
    }
