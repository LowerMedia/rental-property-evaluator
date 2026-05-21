import { SCREENER_METRIC_CONFIG } from '@rpe/engine';
import type { ScreenerResults } from '@rpe/engine';
import { fmtCurrency, fmtPercent, fmtNumber, fmtMultiplier, NULL_DISPLAY } from '../utils/format';
import type { Scenario } from '../state/scenarios';

// ─── Types ────────────────────────────────────────────────────────────────────

type MetricKey = keyof ScreenerResults;

// ─── Formatting (mirrors Evaluator.tsx fmtMetric) ─────────────────────────────

function fmtMetric(key: MetricKey, value: number | null): string {
  if (value === null) return NULL_DISPLAY;
  const cfg = SCREENER_METRIC_CONFIG[key];
  const dec = cfg.decimals ?? 2;
  const unit = cfg.unit ?? '';
  if (unit === '$' || unit === '$/mo' || unit === '$/yr' || unit === '$/sqft') {
    return fmtCurrency(value, dec > 0);
  }
  if (unit === '%') return fmtPercent(value, dec);
  if (unit === '×') return fmtMultiplier(value, dec);
  return fmtNumber(value, dec);
}

function evalSignal(
  key: MetricKey,
  value: number | null,
): 'pass' | 'fail' | 'null' | 'neutral' {
  if (value === null) return 'null';
  const cfg = SCREENER_METRIC_CONFIG[key];
  if (cfg.direction === 'none' || cfg.threshold === undefined) return 'neutral';
  return cfg.direction === 'higher'
    ? value >= cfg.threshold ? 'pass' : 'fail'
    : value <= cfg.threshold ? 'pass' : 'fail';
}

// ─── Best-value indices ───────────────────────────────────────────────────────

/**
 * Returns the set of column indices that hold the "best" value for a metric.
 * Empty set = no winner (all null, all tied with one scenario, or direction='none').
 */
function bestIndices(key: MetricKey, values: (number | null)[]): Set<number> {
  const cfg = SCREENER_METRIC_CONFIG[key];
  if (cfg.direction === 'none' || values.length < 2) return new Set();

  const nonNull = values.flatMap((v, i): { v: number; i: number }[] =>
    v !== null ? [{ v, i }] : [],
  );
  if (nonNull.length < 2) return new Set();

  const bestVal =
    cfg.direction === 'higher'
      ? Math.max(...nonNull.map((x) => x.v))
      : Math.min(...nonNull.map((x) => x.v));

  return new Set(nonNull.filter((x) => x.v === bestVal).map((x) => x.i));
}

// ─── Score card row ───────────────────────────────────────────────────────────

const SCORED_KEYS: MetricKey[] = (
  Object.entries(SCREENER_METRIC_CONFIG) as [MetricKey, (typeof SCREENER_METRIC_CONFIG)[MetricKey]][]
)
  .filter(([, cfg]) => cfg.direction !== 'none')
  .map(([key]) => key);

function scoreFor(result: ScreenerResults): { passing: number; total: number; pct: number } {
  const signals = SCORED_KEYS.map((k) => evalSignal(k, result[k]));
  const total = signals.filter((s) => s !== 'null').length;
  const passing = signals.filter((s) => s === 'pass').length;
  return { passing, total, pct: total > 0 ? (passing / total) * 100 : 0 };
}

// ─── Layout constants ─────────────────────────────────────────────────────────

/**
 * Ordered groups and the metric keys each group renders.
 * Mirrors the groups in Evaluator.tsx ResultsPanel.
 */
const GROUPS: { title: string; keys: MetricKey[] }[] = [
  {
    title: 'Returns',
    keys: ['capRate', 'cocRoi', 'cashFlowMonthly', 'cashFlowAnnual'],
  },
  {
    title: 'Deal Quality',
    keys: [
      'dscr',
      'onePercentRule',
      'grm',
      'grossYield',
      'breakEvenOccupancy',
      'expenseRatio',
      'fiftyPctRuleDeviation',
    ],
  },
  {
    title: 'Income & Expenses',
    keys: ['egi', 'egiAnnual', 'noiMonthly', 'noiAnnual', 'opExMonthly', 'opExAnnual', 'piti'],
  },
  {
    title: 'Loan',
    keys: ['loanAmount', 'mortgagePayment', 'ltv', 'dscr', 'debtYield', 'totalInterest'],
  },
  {
    title: 'Capital',
    keys: ['totalCashInvested', 'pricePerUnit', 'pricePerSqft'],
  },
];

// Display labels matching Evaluator.tsx overrides
const LABEL_OVERRIDES: Partial<Record<MetricKey, string>> = {
  cashFlowMonthly: 'Cash Flow / mo',
  cashFlowAnnual: 'Cash Flow / yr',
  egi: 'EGI / mo',
  egiAnnual: 'EGI / yr',
  noiMonthly: 'NOI / mo',
  noiAnnual: 'NOI / yr',
  opExMonthly: 'OpEx / mo',
  opExAnnual: 'OpEx / yr',
  piti: 'PITI / mo',
  mortgagePayment: 'P&I / mo',
  totalCashInvested: 'Total Cash In',
  onePercentRule: '1% Rule',
  fiftyPctRuleDeviation: '50% Rule Dev.',
};

// ─── Signal dot ───────────────────────────────────────────────────────────────

const DOT_BG: Record<ReturnType<typeof evalSignal>, string> = {
  pass: 'bg-pass',
  fail: 'bg-fail',
  null: 'bg-null',
  neutral: 'bg-muted',
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface ComparisonPanelProps {
  scenarios: Scenario[];
  resultsList: ScreenerResults[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ComparisonPanel({ scenarios, resultsList }: ComparisonPanelProps) {
  const colCount = scenarios.length;

  // Column width: distribute evenly across the value area
  // Metric label gets ~160px; remaining space split by columns
  const COL_MIN = 'min-w-[90px]';

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        {/* ── Column headers ── */}
        <thead>
          {/* Score summary row */}
          <tr className="border-b border-border">
            <th className="sticky left-0 z-10 bg-base px-4 py-3 text-left font-normal text-lo w-40">
              {/* empty corner */}
            </th>
            {scenarios.map((scenario, si) => {
              const score = scoreFor(resultsList[si] ?? {} as ScreenerResults);
              const color =
                score.pct >= 75 ? 'text-pass' : score.pct >= 50 ? 'text-warn' : 'text-fail';
              return (
                <th
                  key={scenario.id}
                  className={`${COL_MIN} px-3 py-3 text-center align-bottom border-l border-border`}
                >
                  <div className="font-normal text-mid mb-1 truncate">{scenario.name}</div>
                  <div className={`num font-mono text-base ${color}`}>
                    {score.passing}
                    <span className="text-lo text-xs">/{score.total}</span>
                  </div>
                  {/* Mini progress bar */}
                  <div className="mt-1.5 h-0.5 rounded-full bg-raised overflow-hidden mx-2">
                    <div
                      className={`h-full rounded-full ${score.pct >= 75 ? 'bg-pass' : score.pct >= 50 ? 'bg-warn' : 'bg-fail'}`}
                      style={{ width: `${score.pct}%` }}
                    />
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {GROUPS.map(({ title, keys }) => {
            // Filter out keys that are null across ALL scenarios (hide them entirely)
            const visibleKeys = keys.filter((k) =>
              resultsList.some((r) => r[k] !== null),
            );
            if (visibleKeys.length === 0) return null;

            return (
              <>
                {/* Section header */}
                <tr key={`${title}-header`} className="border-b border-border">
                  <td
                    colSpan={colCount + 1}
                    className="sticky left-0 bg-raised px-4 py-1.5"
                  >
                    <span className="section-title text-[10px]">{title}</span>
                  </td>
                </tr>

                {/* Metric rows */}
                {visibleKeys.map((key) => {
                  const cfg = SCREENER_METRIC_CONFIG[key];
                  const values = resultsList.map((r) => r[key]);
                  const best = bestIndices(key, values);
                  const label = LABEL_OVERRIDES[key] ?? cfg.label;

                  return (
                    <tr
                      key={`${title}-${key}`}
                      className="border-b border-border last:border-b-0 hover:bg-raised/40 transition-colors"
                    >
                      {/* Metric label */}
                      <td
                        className="sticky left-0 z-10 bg-base px-4 py-2 text-left text-lo w-40 hover:text-mid"
                        title={cfg.description}
                      >
                        {label}
                      </td>

                      {/* Values per scenario */}
                      {values.map((value, si) => {
                        const signal = evalSignal(key, value);
                        const isBest = best.has(si);
                        const textColor =
                          signal === 'pass' ? 'text-pass'
                          : signal === 'fail' ? 'text-fail'
                          : signal === 'null' ? 'text-null'
                          : 'text-hi';

                        return (
                          <td
                            key={scenarios[si]?.id ?? si}
                            className={`
                              ${COL_MIN} px-3 py-2 text-right align-middle
                              border-l border-border
                              ${isBest ? 'bg-accent/5' : ''}
                            `}
                          >
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Signal dot */}
                              <span
                                className={`shrink-0 w-1.5 h-1.5 rounded-full ${DOT_BG[signal]}`}
                                aria-hidden="true"
                              />
                              {/* Value */}
                              <span
                                className={`num font-mono tabular-nums ${textColor} ${isBest ? 'font-medium' : ''}`}
                              >
                                {fmtMetric(key, value)}
                              </span>
                              {/* Best badge */}
                              {isBest && (
                                <span
                                  className="text-accent text-[9px] leading-none"
                                  title="Best value"
                                  aria-label="best"
                                >
                                  ★
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
