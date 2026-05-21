/**
 * AmortizationPanel — year-by-year loan breakdown + SVG stacked bar chart (RPE-30).
 *
 * Props: the three loan primitives needed to run the schedule.
 * The panel hides itself when loanAmount ≤ 0 (cash purchase).
 */

import { useEffect, useMemo, useState } from 'react';
import { amortize } from '@rpe/engine';
import { buildAmortizationYears, findCrossoverYear } from '../utils/amortization';
import { fmtCurrency } from '../utils/format';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface AmortizationPanelProps {
  loanAmount: number;
  interestRate: number;
  loanTermYears: number;
}

// ─── SVG chart ────────────────────────────────────────────────────────────────

const CHART_W = 1000;
const CHART_H = 160;
const BAR_GAP = 2;

interface ChartProps {
  years: ReturnType<typeof buildAmortizationYears>;
  crossoverIdx: number;
}

function AmortizationChart({ years, crossoverIdx }: ChartProps) {
  if (years.length === 0) return null;

  const n = years.length;
  const barW = (CHART_W - BAR_GAP * (n - 1)) / n;
  // Scale against the maximum annual payment so each bar fills the chart height
  // proportionally. Using per-bar max (rather than years[0]) correctly handles
  // partial final years or any floating-point rounding in the amortization schedule.
  const maxPayment = Math.max(...years.map((y) => y.annualPayment));

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H + 24}`}
        className="w-full"
        aria-label="Amortization chart — principal vs interest per year"
        role="img"
      >
        {years.map((y, i) => {
          const x = i * (barW + BAR_GAP);
          const denom = maxPayment > 0 ? maxPayment : 1;
          const interestH = (y.interestPaid / denom) * CHART_H;
          const principalH = (y.principalPaid / denom) * CHART_H;
          const isEven = i % 2 === 0;

          return (
            <g key={y.year} aria-label={`Year ${y.year}`}>
              {/* Interest (top — amber) */}
              <rect
                x={x}
                y={0}
                width={barW}
                height={interestH}
                fill="var(--color-accent-dim)"
                opacity={isEven ? 1 : 0.85}
              />
              {/* Principal (bottom — green) */}
              <rect
                x={x}
                y={interestH}
                width={barW}
                height={principalH}
                fill="var(--color-pass)"
                opacity={isEven ? 1 : 0.85}
              />
              {/* Crossover marker */}
              {i === crossoverIdx && (
                <rect
                  x={x - 1}
                  y={0}
                  width={barW + 2}
                  height={CHART_H}
                  fill="none"
                  stroke="var(--color-hi)"
                  strokeWidth={1.5}
                  opacity={0.4}
                />
              )}
              {/* X-axis label every 5 years (or every year for short terms) */}
              {(n <= 15 || y.year % 5 === 0 || y.year === 1) && (
                <text
                  x={x + barW / 2}
                  y={CHART_H + 16}
                  textAnchor="middle"
                  fontSize={n > 20 ? 28 : 22}
                  fill="var(--color-lo)"
                >
                  {y.year}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-1 text-[10px] text-lo">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: 'var(--color-pass)' }} />
          Principal
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: 'var(--color-accent-dim)' }} />
          Interest
        </span>
        {crossoverIdx >= 0 && (
          <span className="text-hi/50">
            crossover: year {crossoverIdx + 1}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Year table ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

interface TableProps {
  years: ReturnType<typeof buildAmortizationYears>;
}

function AmortizationTable({ years }: TableProps) {
  const [page, setPage] = useState(0);
  // Reset to first page whenever the schedule length changes (e.g. loan term edited).
  useEffect(() => { setPage(0); }, [years.length]);
  const totalPages = Math.ceil(years.length / PAGE_SIZE);
  const slice = years.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-lo text-right border-b border-border">
            <th className="py-1.5 text-left font-normal">Yr</th>
            <th className="py-1.5 font-normal">Payment</th>
            <th className="py-1.5 font-normal">Principal</th>
            <th className="py-1.5 font-normal">Interest</th>
            <th className="py-1.5 font-normal">Balance</th>
          </tr>
        </thead>
        <tbody>
          {slice.map((y) => (
            <tr
              key={y.year}
              className="text-right border-b border-border/50 last:border-b-0 hover:bg-raised/40 transition-colors"
            >
              <td className="py-1.5 text-left text-lo">{y.year}</td>
              <td className="py-1.5 num tabular-nums text-mid">{fmtCurrency(y.annualPayment)}</td>
              <td className="py-1.5 num tabular-nums text-pass">{fmtCurrency(y.principalPaid)}</td>
              <td className="py-1.5 num tabular-nums" style={{ color: 'var(--color-accent)' }}>{fmtCurrency(y.interestPaid)}</td>
              <td className="py-1.5 num tabular-nums text-hi">{fmtCurrency(y.endingBalance)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-2 text-[10px] text-lo">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-2 py-0.5 rounded border border-border disabled:opacity-30 hover:border-accent hover:text-accent transition-colors"
          >
            ← prev
          </button>
          <span>years {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, years.length)} of {years.length}</span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page === totalPages - 1}
            className="px-2 py-0.5 rounded border border-border disabled:opacity-30 hover:border-accent hover:text-accent transition-colors"
          >
            next →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function AmortizationPanel({ loanAmount, interestRate, loanTermYears }: AmortizationPanelProps) {
  const data = useMemo(() => {
    if (loanAmount <= 0) return null;
    const schedule = amortize(loanAmount, interestRate, loanTermYears);
    if (!schedule) return null;
    const years = buildAmortizationYears(schedule);
    const crossoverIdx = findCrossoverYear(years);
    const totalInterest = schedule.totalInterest;
    return { years, crossoverIdx, totalInterest };
  }, [loanAmount, interestRate, loanTermYears]);

  if (!data || data.years.length === 0) return null;

  const { years, crossoverIdx, totalInterest } = data;
  const firstYear = years[0]!;
  const lastYear = years[years.length - 1]!;

  return (
    <details className="group rounded border border-border bg-surface overflow-hidden">
      <summary className="flex items-center justify-between px-4 py-2 cursor-pointer bg-raised border-b border-border hover:bg-raised/80 transition-colors select-none list-none">
        <h3 className="section-title text-xs">Amortization Schedule</h3>
        <span className="text-[10px] text-lo group-open:hidden">
          {loanTermYears}yr · {fmtCurrency(totalInterest, false)} total interest
        </span>
        <span className="text-[10px] text-lo hidden group-open:inline">▲ collapse</span>
      </summary>

      <div className="px-4 py-4 flex flex-col gap-5">

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-[10px] text-lo mb-0.5">Annual payment</p>
            <p className="num text-sm tabular-nums text-hi">{fmtCurrency(firstYear.annualPayment)}</p>
          </div>
          <div>
            <p className="text-[10px] text-lo mb-0.5">Total interest</p>
            <p className="num text-sm tabular-nums" style={{ color: 'var(--color-accent)' }}>
              {fmtCurrency(totalInterest, false)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-lo mb-0.5">Final balance</p>
            <p className="num text-sm tabular-nums text-pass">
              {fmtCurrency(lastYear.endingBalance, false)}
            </p>
          </div>
        </div>

        {/* Chart */}
        <AmortizationChart years={years} crossoverIdx={crossoverIdx} />

        {/* Table */}
        <AmortizationTable years={years} />

      </div>
    </details>
  );
}
