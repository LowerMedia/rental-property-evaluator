/**
 * ProFormaCharts — SVG data visualizations for the pro-forma hold projection (RPE-31).
 *
 * Two charts:
 *  1. CashFlowChart  — grouped bars per year: NOI (neutral) | Debt Svc (muted) | Net CF (pass/fail).
 *  2. EquityBuildChart — property value (top line) vs loan balance (dashed line), equity shaded.
 *
 * Pure SVG, no external dependencies. Uses the same CSS variable tokens as the rest of the UI.
 */

import { useId } from 'react';
import type { ProjectionYear } from '@rpe/engine';
import { fmtCurrency } from '../utils/format';

// ─── Shared constants ─────────────────────────────────────────────────────────

const W = 1000;
const H = 180;
const PAD_TOP = 12;
const PAD_BOT = 28; // space for x-axis labels
const PAD_LEFT = 0;
const LABEL_FONT = 22;

/** Map a value from [domainMin, domainMax] → [rangeMin, rangeMax]. */
function scale(v: number, dMin: number, dMax: number, rMin: number, rMax: number): number {
  if (dMax === dMin) return (rMin + rMax) / 2;
  return rMin + ((v - dMin) / (dMax - dMin)) * (rMax - rMin);
}

// ─── Cash flow grouped bar chart ──────────────────────────────────────────────
//
// Three bars per year (left → right):
//   1. NOI        — neutral/mid colour, always non-negative
//   2. Debt Svc   — muted/lo colour, always non-negative (0 for cash deals)
//   3. Net CF     — pass (green) when ≥ 0, fail (red) when < 0
//
// All three share the same domain so bar heights are directly comparable.

interface CashFlowChartProps {
  years: ProjectionYear[];
}

export function CashFlowChart({ years }: CashFlowChartProps) {
  // useId() produces a per-instance ID so multiple <Evaluator /> mounts on
  // the same page (WP block) don't collide and break aria-labelledby.
  const uid = useId();
  const titleId = `${uid}-cashflow-title`;

  if (years.length === 0) return null;

  const n = years.length;

  // Domain spans NOI, debt service, and net CF (which can go negative)
  const allValues = [
    0,
    ...years.map((y) => y.noiAnnual),
    ...years.map((y) => y.annualDebtService),
    ...years.map((y) => y.cashFlowAnnual),
  ];
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);

  const chartH = H - PAD_TOP - PAD_BOT;

  const GROUP_GAP = 4;    // gap between year groups
  const BAR_GAP = 1;      // gap between bars within a group
  const groupW = (W - PAD_LEFT - GROUP_GAP * (n - 1)) / n;
  const barW = (groupW - BAR_GAP * 2) / 3;

  // Y coordinate for the zero line within the chart area
  const zeroY = PAD_TOP + scale(0, minVal, maxVal, chartH, 0);

  // Y-axis labels at min (if negative), zero, max
  const yLabels: { y: number; val: number }[] = [];
  if (minVal < 0) yLabels.push({ y: PAD_TOP + chartH, val: minVal });
  yLabels.push({ y: zeroY, val: 0 });
  if (maxVal > 0) yLabels.push({ y: PAD_TOP, val: maxVal });

  /** Bar rect coords for a given value (anchored at zero). */
  function barRect(val: number): { y: number; h: number } {
    const top = PAD_TOP + scale(Math.max(0, val), minVal, maxVal, chartH, 0);
    const bot = PAD_TOP + scale(Math.min(0, val), minVal, maxVal, chartH, 0);
    return { y: top, h: Math.max(1, bot - top) };
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] text-lo uppercase tracking-widest">Annual Cash Flow</p>
      <div className="w-full">
        <svg
          viewBox={`0 0 ${W} ${H + 4}`}
          className="w-full"
          role="img"
          aria-labelledby={titleId}
          aria-label="Annual cash flow grouped bars per year"
        >
          {/* <title> is the SVG-native label; aria-label kept as fallback for ATs
              that don't honour aria-labelledby on inline SVG. */}
          <title id={titleId}>Annual cash flow grouped bars per year</title>
          {/* Zero baseline */}
          <line
            x1={0} y1={zeroY}
            x2={W} y2={zeroY}
            stroke="var(--color-border)"
            strokeWidth={1}
          />

          {years.map((y, i) => {
            const gx = PAD_LEFT + i * (groupW + GROUP_GAP);
            const noi = barRect(y.noiAnnual);
            const ds  = barRect(y.annualDebtService);
            const cf  = barRect(y.cashFlowAnnual);

            return (
              <g key={y.year}>
                {/* NOI bar */}
                <rect
                  x={gx}
                  y={noi.y}
                  width={barW}
                  height={noi.h}
                  fill="var(--color-mid)"
                  opacity={0.6}
                />
                {/* Debt service bar */}
                <rect
                  x={gx + barW + BAR_GAP}
                  y={ds.y}
                  width={barW}
                  height={ds.h}
                  fill="var(--color-lo)"
                  opacity={0.45}
                />
                {/* Net CF bar */}
                <rect
                  x={gx + (barW + BAR_GAP) * 2}
                  y={cf.y}
                  width={barW}
                  height={cf.h}
                  fill={y.cashFlowAnnual >= 0 ? 'var(--color-pass)' : 'var(--color-fail)'}
                  opacity={0.85}
                />
                {/* X label centred on group */}
                {(n <= 15 || y.year % 5 === 0 || y.year === 1 || y.year === n) && (
                  <text
                    x={gx + groupW / 2}
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

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-lo">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-2 rounded-sm" style={{ background: 'var(--color-mid)', opacity: 0.6 }} />
          NOI
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-2 rounded-sm" style={{ background: 'var(--color-lo)', opacity: 0.45 }} />
          Debt Svc
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-2 rounded-sm" style={{ background: 'var(--color-pass)', opacity: 0.85 }} />
          Net CF
        </span>
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
  const uid = useId();
  const titleId = `${uid}-equity-title`;

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

  // Year-0 loan balance: use provided value, or estimate from year-1 data
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

  // x-labels: y.year is 1-indexed, so xOf(y.year) gives the correct x position
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
          role="img"
          aria-labelledby={titleId}
          aria-label="Property value and equity growth over hold period"
        >
          {/* <title> is the SVG-native label; aria-label kept as fallback for ATs
              that don't honour aria-labelledby on inline SVG. */}
          <title id={titleId}>Property value and equity growth over hold period</title>
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

          {/* X-axis labels — use y.year directly (1-indexed) instead of indexOf (O(n²)) */}
          {xLabels.map((y) => (
            <text
              key={y.year}
              x={xOf(y.year)}
              y={H - 4}
              textAnchor="middle"
              fontSize={LABEL_FONT}
              fill="var(--color-lo)"
            >
              {y.year}
            </text>
          ))}

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
