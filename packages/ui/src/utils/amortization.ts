/**
 * Amortization schedule utilities (RPE-30).
 *
 * Pure functions — no React, no DOM.
 */

import type { AmortizationSchedule } from '@rpe/engine';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AmortizationYear {
  /** 1-indexed. */
  year: number;
  /** Total payments made during the year. */
  annualPayment: number;
  /** Principal repaid during the year. */
  principalPaid: number;
  /** Interest paid during the year. */
  interestPaid: number;
  /** Remaining balance at end of year. */
  endingBalance: number;
  /** Running total principal repaid through this year. */
  cumulativePrincipal: number;
  /** Running total interest paid through this year. */
  cumulativeInterest: number;
}

// ─── Aggregator ───────────────────────────────────────────────────────────────

/**
 * Aggregate a monthly amortization schedule into year-by-year summaries.
 *
 * Returns an array of length `ceil(rows.length / 12)` — one entry per year of the
 * loan term, including any partial final year (e.g. a 10-month loan → 1 year entry).
 */
export function buildAmortizationYears(schedule: AmortizationSchedule): AmortizationYear[] {
  const { rows } = schedule;
  if (rows.length === 0) return [];

  const termYears = Math.ceil(rows.length / 12);
  const years: AmortizationYear[] = [];
  let cumulativePrincipal = 0;
  let cumulativeInterest = 0;

  for (let y = 1; y <= termYears; y++) {
    const start = (y - 1) * 12;
    const end = Math.min(y * 12, rows.length);
    const slice = rows.slice(start, end);

    const annualPayment = slice.reduce((s, r) => s + r.payment, 0);
    const principalPaid = slice.reduce((s, r) => s + r.principal, 0);
    const interestPaid = slice.reduce((s, r) => s + r.interest, 0);
    const endingBalance = slice[slice.length - 1]?.balance ?? 0;

    cumulativePrincipal += principalPaid;
    cumulativeInterest += interestPaid;

    years.push({
      year: y,
      annualPayment,
      principalPaid,
      interestPaid,
      endingBalance,
      cumulativePrincipal,
      cumulativeInterest,
    });
  }

  return years;
}

/**
 * Returns the year index (0-based) where principal paid first exceeds interest paid
 * within a single year. Returns -1 if the crossover never occurs (e.g. interest-only).
 */
export function findCrossoverYear(years: AmortizationYear[]): number {
  return years.findIndex((y) => y.principalPaid >= y.interestPaid);
}
