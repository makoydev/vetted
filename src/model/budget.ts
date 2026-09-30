export interface BudgetCheck {
  allowed: boolean
  maxPaidRunsPerDay: number
  paidRunsToday: number
  ceilingUsd: number
  reason: string
}

/**
 * The daily budget as a worst-case bound (ADR 0004): if every run today
 * cost the most a run can cost, would this one still fit? With a US$0.20
 * budget and a US$0.0104 ceiling, at most 19 runs a day may call the model.
 */
export function checkBudget(input: {
  dailyBudgetUsd: number
  ceilingUsd: number
  /** Earlier runs of this workflow today (UTC), excluding this one. */
  paidRunsToday: number
}): BudgetCheck {
  const maxPaidRunsPerDay =
    input.ceilingUsd > 0
      ? Math.floor(input.dailyBudgetUsd / input.ceilingUsd)
      : 0
  const allowed = input.paidRunsToday + 1 <= maxPaidRunsPerDay
  return {
    allowed,
    maxPaidRunsPerDay,
    paidRunsToday: input.paidRunsToday,
    ceilingUsd: input.ceilingUsd,
    reason: allowed
      ? `Budget: run ${input.paidRunsToday + 1} of at most ${maxPaidRunsPerDay} today.`
      : `Budget: ${input.paidRunsToday} runs today already use the daily limit of ${maxPaidRunsPerDay} (US$${input.dailyBudgetUsd} / US$${input.ceilingUsd.toFixed(4)} per run); using the mock model.`
  }
}
