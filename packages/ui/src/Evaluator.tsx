import { useReducer } from 'react';
import { SCREENER_METRIC_CONFIG } from '@rpe/engine';
import type { ScreenerResults } from '@rpe/engine';
import { dealReducer } from './state/dealReducer';
import { DEFAULT_INPUTS } from './state/defaultInputs';
import { useEvaluate } from './hooks/useEvaluate';
import { DealInputsForm } from './components/inputs/DealInputsForm';
import { fmtCurrency, fmtPercent, fmtNumber, fmtMultiplier, NULL_DISPLAY } from './utils/format';

// ─── Metric helpers ───────────────────────────────────────────────────────────

type MetricKey = keyof ScreenerResults;

/** Format a result value per its MetricConfig unit + decimals. */
function fmtMetric(key: MetricKey, value: number | null): string {
  if (value === null) return NULL_DISPLAY;
  const cfg = SCREENER_METRIC_CONFIG[key];
  const dec = cfg.decimals ?? 2;
  const unit = cfg.unit ?? '';

  // Currency variants
  if (unit === '$' || unit === '$/mo' || unit === '$/yr' || unit === '$/sqft') {
    return fmtCurrency(value, dec > 0);
  }
  if (unit === '%') return fmtPercent(value, dec);
  if (unit === '×') return fmtMultiplier(value, dec);
  return fmtNumber(value, dec);
}

/**
 * Returns 'pass' | 'fail' | 'null' | 'neutral' for a metric.
 * 'neutral' = direction is 'none' (informational).
 */
function evalSignal(key: MetricKey, value: number | null): 'pass' | 'fail' | 'null' | 'neutral' {
  if (value === null) return 'null';
  const cfg = SCREENER_METRIC_CONFIG[key];
  if (cfg.direction === 'none' || cfg.threshold === undefined) return 'neutral';
  return cfg.direction === 'higher' ? (value >= cfg.threshold ? 'pass' : 'fail')
    : (value <= cfg.threshold ? 'pass' : 'fail');
}

/** CSS color class for the signal. */
const SIGNAL_CLASS: Record<ReturnType<typeof evalSignal>, string> = {
  pass: 'text-pass',
  fail: 'text-fail',
  null: 'text-null',
  neutral: 'text-hi',
};

/** Dot background class for the signal. */
const DOT_CLASS: Record<ReturnType<typeof evalSignal>, string> = {
  pass: 'bg-pass',
  fail: 'bg-fail',
  null: 'bg-null',
  neutral: 'bg-muted',
};

/** Human-readable threshold note for a failing metric (e.g. "needs ≥ 1.25×"). */
function thresholdNote(key: MetricKey, signal: ReturnType<typeof evalSignal>): string | null {
  if (signal !== 'fail') return null;
  const cfg = SCREENER_METRIC_CONFIG[key];
  if (cfg.threshold === undefined) return null;

  const dir = cfg.direction === 'higher' ? '≥' : '≤';
  const val = cfg.unit === '%' ? fmtPercent(cfg.threshold, cfg.decimals ?? 1)
    : cfg.unit === '×' ? fmtMultiplier(cfg.threshold, cfg.decimals ?? 2)
    : fmtNumber(cfg.threshold, cfg.decimals ?? 1);
  return `needs ${dir} ${val}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface MetricRowProps {
  metricKey: MetricKey;
  result: ScreenerResults;
  label?: string;
}

function MetricRow({ metricKey, result, label }: MetricRowProps) {
  const cfg = SCREENER_METRIC_CONFIG[metricKey];
  const value = result[metricKey];
  const signal = evalSignal(metricKey, value);
  const note = thresholdNote(metricKey, signal);
  const displayLabel = label ?? cfg.label;

  return (
    <div className="flex items-center gap-2 py-2 border-b border-border last:border-b-0">
      {/* Signal dot */}
      <span
        className={`shrink-0 w-1.5 h-1.5 rounded-full ${DOT_CLASS[signal]}`}
        aria-hidden="true"
      />

      {/* Label + threshold note */}
      <div className="flex-1 min-w-0">
        <span
          className="text-xs text-mid truncate block"
          title={cfg.description}
        >
          {displayLabel}
        </span>
        {note && (
          <span className="text-[10px] text-fail/70 block leading-tight">{note}</span>
        )}
      </div>

      {/* Value */}
      <span className={`num text-sm font-mono tabular-nums shrink-0 ${SIGNAL_CLASS[signal]}`}>
        {fmtMetric(metricKey, value)}
      </span>
    </div>
  );
}

interface ResultGroupProps {
  title: string;
  children: React.ReactNode;
}

function ResultGroup({ title, children }: ResultGroupProps) {
  return (
    <div className="rounded border border-border bg-surface overflow-hidden">
      <div className="px-4 py-2 border-b border-border bg-raised">
        <h3 className="section-title text-xs">{title}</h3>
      </div>
      <div className="px-4 py-0">{children}</div>
    </div>
  );
}

// ─── Score summary ────────────────────────────────────────────────────────────

/** Keys that have a pass/fail direction (excludes 'none'). */
const SCORED_KEYS: MetricKey[] = (
  Object.entries(SCREENER_METRIC_CONFIG) as [MetricKey, (typeof SCREENER_METRIC_CONFIG)[MetricKey]][]
)
  .filter(([, cfg]) => cfg.direction !== 'none')
  .map(([key]) => key);

interface ScoreCardProps {
  result: ScreenerResults;
}

function ScoreCard({ result }: ScoreCardProps) {
  const signals = SCORED_KEYS.map((k) => evalSignal(k, result[k]));
  const total = signals.filter((s) => s !== 'null').length;
  const passing = signals.filter((s) => s === 'pass').length;
  const pct = total > 0 ? (passing / total) * 100 : 0;

  const scoreColor =
    pct >= 75 ? 'text-pass' : pct >= 50 ? 'text-warn' : 'text-fail';

  return (
    <div className="rounded border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between mb-2">
        <span className="section-title text-xs">Score</span>
        <span className={`num text-lg font-mono ${scoreColor}`}>
          {passing}
          <span className="text-lo text-sm">/{total}</span>
        </span>
      </div>
      {/* Progress bar */}
      <div className="h-1 rounded-full bg-raised overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            pct >= 75 ? 'bg-pass' : pct >= 50 ? 'bg-warn' : 'bg-fail'
          }`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={passing}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label={`${passing} of ${total} metrics passing`}
        />
      </div>
      <p className="text-[10px] text-lo mt-1.5">
        metrics meeting conventional thresholds
      </p>
    </div>
  );
}

// ─── Results panel ────────────────────────────────────────────────────────────

interface ResultsPanelProps {
  results: ScreenerResults;
}

function ResultsPanel({ results }: ResultsPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <ScoreCard result={results} />

      {/* ── Returns ──────────────────────────────────────────────────────── */}
      <ResultGroup title="Returns">
        <MetricRow metricKey="capRate" result={results} />
        <MetricRow metricKey="cocRoi" result={results} />
        <MetricRow metricKey="cashFlowMonthly" result={results} label="Cash Flow / mo" />
        <MetricRow metricKey="cashFlowAnnual" result={results} label="Cash Flow / yr" />
      </ResultGroup>

      {/* ── Deal Quality ─────────────────────────────────────────────────── */}
      <ResultGroup title="Deal Quality">
        <MetricRow metricKey="dscr" result={results} />
        <MetricRow metricKey="onePercentRule" result={results} label="1% Rule" />
        <MetricRow metricKey="grm" result={results} />
        <MetricRow metricKey="grossYield" result={results} />
        <MetricRow metricKey="breakEvenOccupancy" result={results} />
        <MetricRow metricKey="expenseRatio" result={results} />
        <MetricRow metricKey="fiftyPctRuleDeviation" result={results} label="50% Rule Dev." />
      </ResultGroup>

      {/* ── Income & Expenses ────────────────────────────────────────────── */}
      <ResultGroup title="Income & Expenses">
        <MetricRow metricKey="egi" result={results} label="EGI / mo" />
        <MetricRow metricKey="egiAnnual" result={results} label="EGI / yr" />
        <MetricRow metricKey="noiMonthly" result={results} label="NOI / mo" />
        <MetricRow metricKey="noiAnnual" result={results} label="NOI / yr" />
        <MetricRow metricKey="opExMonthly" result={results} label="OpEx / mo" />
        <MetricRow metricKey="opExAnnual" result={results} label="OpEx / yr" />
        <MetricRow metricKey="piti" result={results} label="PITI / mo" />
      </ResultGroup>

      {/* ── Loan ─────────────────────────────────────────────────────────── */}
      <ResultGroup title="Loan">
        <MetricRow metricKey="loanAmount" result={results} />
        <MetricRow metricKey="mortgagePayment" result={results} label="P&I / mo" />
        <MetricRow metricKey="ltv" result={results} />
        <MetricRow metricKey="dscr" result={results} />
        <MetricRow metricKey="debtYield" result={results} />
        <MetricRow metricKey="totalInterest" result={results} />
      </ResultGroup>

      {/* ── Capital ──────────────────────────────────────────────────────── */}
      <ResultGroup title="Capital">
        <MetricRow metricKey="totalCashInvested" result={results} label="Total Cash In" />
        {results.pricePerUnit !== null && (
          <MetricRow metricKey="pricePerUnit" result={results} />
        )}
        {results.pricePerSqft !== null && (
          <MetricRow metricKey="pricePerSqft" result={results} />
        )}
      </ResultGroup>
    </div>
  );
}

// ─── Main Evaluator ───────────────────────────────────────────────────────────

/**
 * Top-level SPA component.
 *
 * State: `useReducer(dealReducer, DEFAULT_INPUTS)`
 * Evaluation: `useEvaluate` (memoised synchronous evaluate on blur-committed state)
 * Layout: sticky header / two-column (inputs | results), independently scrollable
 */
export function Evaluator() {
  const [state, dispatch] = useReducer(dealReducer, DEFAULT_INPUTS);
  const results = useEvaluate(state);

  return (
    <div className="min-h-dvh bg-base text-hi flex flex-col">
      {/* ── Skip navigation ──────────────────────────────────────────────── */}
      <a
        href="#results"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-raised focus:px-3 focus:py-1.5 focus:text-xs focus:text-accent"
      >
        Skip to results
      </a>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-base/90 px-5 py-3 backdrop-blur-sm">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-xl tracking-wide text-hi">
            Rental Property Evaluator
          </h1>
          <span className="hidden text-xs text-lo sm:inline">Screener</span>
        </div>
        <button
          type="button"
          onClick={() => dispatch({ type: 'RESET' })}
          className="
            rounded border border-border px-3 py-1.5
            text-xs text-mid uppercase tracking-widest
            hover:border-accent hover:text-accent
            transition-colors
          "
        >
          Reset
        </button>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col lg:grid lg:grid-cols-[380px_1fr] overflow-hidden">
        {/* Left — inputs */}
        <aside
          aria-label="Deal inputs"
          className="overflow-y-auto border-b border-border lg:border-b-0 lg:border-r lg:border-border"
        >
          <DealInputsForm state={state} dispatch={dispatch} />
        </aside>

        {/* Right — results */}
        <section
          id="results"
          aria-label="Evaluation results"
          className="overflow-y-auto p-5"
        >
          <ResultsPanel results={results} />
        </section>
      </div>
    </div>
  );
}
