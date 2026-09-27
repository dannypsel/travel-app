// Client-side copy of the backend's pacing math (api/pacing.py), used ONLY in
// seed/dev-only mode when there is no real backend trip to pace. For real trips
// the backend computes pacing and the frontend just renders it.

import type { PacingDay } from '@/types'
import { addDays, daysBetweenInclusive } from './tz'

export function dailyAllowance(
  totalBudget: number,
  fixedCosts: number,
  numDays: number,
): number {
  return (totalBudget - fixedCosts) / Math.max(1, numDays)
}

export interface LocalPacing {
  daily_allowance: number
  days: PacingDay[]
  total_spent: number
  remaining: number
}

export function tripPacingLocal(
  totalBudget: number,
  fixedCosts: number,
  startDate: string,
  endDate: string,
  expensesByDate: Record<string, number>,
): LocalPacing {
  const numDays = daysBetweenInclusive(startDate, endDate)
  const allowance = dailyAllowance(totalBudget, fixedCosts, numDays)
  const days: PacingDay[] = []
  let totalSpent = 0
  for (let i = 0; i < numDays; i++) {
    const date = addDays(startDate, i)
    const spent = expensesByDate[date] ?? 0
    totalSpent += spent
    days.push({
      date,
      spent,
      allowance,
      status:
        spent > allowance ? 'over' : spent < allowance ? 'under' : 'even',
    })
  }
  return {
    daily_allowance: allowance,
    days,
    total_spent: totalSpent,
    remaining: totalBudget - fixedCosts - totalSpent,
  }
}
