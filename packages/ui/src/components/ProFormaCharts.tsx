/**
 * ProFormaCharts — SVG data visualizations for the pro-forma hold projection (RPE-31).
 *
 * Two charts:
 *  1. CashFlowChart  — annual cash-flow bars (green = positive, red = negative), zero line.
 *  2. EquityBuildChart — property value (top line) vs loan balance (bottom line), equity shaded.
 *
 * Pure SVG, no external dependencies. Uses the same CSS variable tokens as the rest of the UI.
 */

import type { ProjectionYear } from '@rpe/engine';
import { fmtCurrency } from '../utils/format';

// ─── Shared constants ─────────────────────────────────────────────────────────

const W = 1000;
const H = 180;
const PAD_TOP = 12;
const PAD_BOT = 28; // space for x-axis labels
const PAD_LEFT = 0;
const BAR_GAP = 3;
const LABEL_FONT = 22;

/** Map a value from [domainMin, domainMax] → [rangeMin, rangeMax]. */
function scale(v: number, dMin: number, dMax: number, rMin: number, rMax: number): number {
  if (dMax === dMin) return (rMin + rMax) / 2;
  return rMin + ((v - dMin) / (dMax - dMin)) * (rMax - rMin);
}

// ─── Cash flow bar chart ──────────────────────────────────────────────────────

interface CashFlowChartProps {
  years: ProjectionYear[];
}

export function CashFlowChart({ years }: CashFlowChartProps) {
  if (years.length === 0) return null;

  const n = years.length;
  const values = years.map((y) => y.cashFlowAnnual);
  const minVal = Math.min(0, ...values);
  const maxVal = Math.max(0, ...values);

  const chartH = H - PAD_TOP - PAD_BOT;
  const barW = (W - PAD_LEFT - BAR_GAP * (n - 1)) / n;

  // Y coordinate for zero line within the chart area
  const zeroY = PAD_TOP + scale(0, minVal, maxVal, chartH, 0);

  // Show y-axis labels at min, zero, max
  const yLabels: { y: number; val: number }[] = [];
  if (minVal < 0) yLabels.push({ y: PAD_TOP + chartH, val: minVal });
  yLabels.push({ y: zeroY, val: 0 });
  if (maxVal > 0) yLabels.push({ y: PAD_TOP, val: maxVal });

  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] text-lo uppercase tracking-widest">Annual Cash Flow</p>
      <div className="w-full">
        <svg
          viewBox={`0 0 ${W} ${H + 4}`}
          className="w-full"
          aria-label="Annual cash flow per year"
          role="img"
        >
          {/* Zero baseline */}
          <line
            x1={0} y1={zeroY}
            x2={W} y2={zeroY}
            stroke="var(--color-border)"
            strokeWidth={1}
          />

          {years.map((y, i) => {
            const x = PAD_LEFT + i * (barW + BAR_GAP);
            const val = y.cashFlowAnnual;
            const isPositive = val >= 0;

            // Bar from zero to value
            const barTop = PAD_TOP + scale(Math.max(0, val), minVal, maxVal, chartH, 0);
            const barBot = PAD_TOP + scale(Math.min(0, val), minVal, maxVal, chartH, 0);
            const barHeight = Math.max(1, barBot - barTop);

            return (
              <g key={y.year}>
                <rect
                  x={x}
                  y={barTop}
                  width={barW}
                  height={barHeight}
                  fill={isPositive ? 'var(--color-pass)' : 'var(--color-fail)'}
                  opacity={0.85}
                />
                {/* X label: every year for short holds, every 5 for long */}
                {(n <= 15 || y.year % 5 === 0 || y.year === 1 || y.year === n) && (
                  <text
                    x={x + barW / 2}
                    y={H - 4}
                    textAnchor="middle"
                    fontSize={LABEL_FONT}
                    fill="var(--color-lo)"
                  >
                    {y.year}
                  </text>
                )}
              </g>
            );
          })}

          {/* Y-axis value labels (right side) */}
          {yLabels.map(({ y, val }) => (
            <text
              key={val}
              x={W - 2}
              y={y + 6}
              textAnchor="end"
              fontSize={18}
              fill="var(--color-lo)"
            >
              {val === 0 ? '0' : fmtCurrency(val, false)}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}

// ─── Equity build chart ───────────────────────────────────────────────────────

interface EquityBuildChartProps {
  years: ProjectionYear[];
  purchasePrice: number;
  /** Initial loan balance (year 0). If absent, inferred from year-1 loanBalance + principal paid. */
  initialLoanBalance?: number;
}

export function EquityBuildChart({ years, purchasePrice, initialLoanBalance }: EquityBuildChartProps) {
  if (years.length === 0) return null;

  const n = years.length;
  const chartH = H - PAD_TOP - PAD_BOT;

  const allValues = [
    purchasePrice,
    ...years.map((y) => y.propertyValue),
    ...years.map((y) => y.loanBalance),
    0,
  ];
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);

  /** Map a dollar value to an SVG y coordinate. */
  const yOf = (v: number) =>
    PAD_TOP + scale(v, minVal, maxVal, chartH, 0);

  // X positions: year 0 at left, year N at right
  const xOf = (idx: number) =>
    scale(idx, 0, n, 0, W);

  // Points for property value line (year 0 = purchasePrice)
  const propPoints: [number, number][] = [
    [xOf(0), yOf(purchasePrice)],
    ...years.map((y, i) => [xOf(i + 1), yOf(y.propertyValue)] as [number, number]),
  ];

  // Year-0 loan balance: use provided value, or estimate from screener (loanBalance[0] + principal paid in year 1)
  const year0Loan = initialLoanBalance ?? (
    years[0]!.loanBalance + (years[0]!.annualDebtService - years[0]!.interestPaid)
  );

  // Points for loan balance line
  const loanPoints: [number, number][] = [
    [xOf(0), yOf(year0Loan)],
    ...years.map((y, i) => [xOf(i + 1), yOf(y.loanBalance)] as [number, number]),
  ];

  const toPath = (pts: [number, number][]) =>
    pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');

  // Equity fill: polygon = property value line down + loan balance line reversed
  const equityFillPoints = [
    ...propPoints,
    ...[...loanPoints].reverse(),
  ];
  const fillPath =
    equityFillPoints.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ') + ' Z';

  const xLabels = years.filter(
    (y) => n <= 15 || y.year % 5 === 0 || y.year === 1 || y.year === n,
  );

  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] text-lo uppercase tracking-widest">Equity Build</p>
      <div className="w-full">
        <svg
          viewBox={`0 0 ${W} ${H + 4}`}
          className="w-full"
          aria-label="Property value and equity growth over hold period"
          role="img"
        >
          {/* Equity shaded fill */}
          <path
            d={fillPath}
            fill="var(--color-pass)"
            opacity={0.12}
          />

          {/* Property value line */}
          <path
            d={toPath(propPoints)}
            fill="none"
            stroke="var(--color-hi)"
            strokeWidth={2}
            strokeLinejoin="round"
          />

          {/* Loan balance line */}
          <path
            d={toPath(loanPoints)}
            fill="none"
            stroke="var(--color-lo)"
            strokeWidth={1.5}
            strokeDasharray="6 3"
            strokeLinejoin="round"
          />

          {/* X-axis labels */}
          {xLabels.map((y, _i) => {
            const idx = years.indexOf(y);
            return (
              <text
                key={y.year}
                x={xOf(idx + 1)}
                y={H - 4}
                textAnchor="middle"
                fontSize={LABEL_FONT}
                fill="var(--color-lo)"
              >
                {y.year}
              </text>
            );
          })}

          {/* End-point equity label */}
          {(() => {
            const last = years[years.length - 1]!;
            const ex = xOf(n);
            const ey = yOf(last.equity / 2 + last.loanBalance);
            return (
              <text
                x={ex - 8}
                y={ey}
                textAnchor="end"
                fontSize={20}
                fill="var(--color-pass)"
                opacity={0.7}
              >
                {fmtCurrency(last.equity, false)}
              </text>
            );
          })()}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-lo">
        <span className="flex items-center gap-1.5">
          <svg width="16" height="2" className="shrink-0">
            <line x1="0" y1="1" x2="16" y2="1" stroke="var(--color-hi)" strokeWidth="2" />
          </svg>
          Property value
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="16" height="2" className="shrink-0">
            <line x1="0" y1="1" x2="16" y2="1" stroke="var(--color-lo)" strokeWidth="1.5" strokeDasharray="4 2" />
          </svg>
          Loan balance
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm opacity-50" style={{ background: 'var(--color-pass)' }} />
          Equity
        </span>
      </div>
    </div>
  );
}
