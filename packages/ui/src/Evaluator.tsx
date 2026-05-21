import { useReducer } from 'react';
import { SCREENER_METRIC_CONFIG } from '@rpe/engine';
import type { ScreenerResults } from '@rpe/engine';
import { dealReducer } from './state/dealReducer';
import { DEFAULT_INPUTS } from './state/defaultInputs';
import { useEvaluate } from './hooks/useEvaluate';
import { DealInputsForm } from './components/inputs/DealInputsForm';
import {
  fmtCurrency,
  fmtPercent,
  fmtNumber,
  fmtMultiplier,
  NULL_DISPLAY,
} from './utils/format';

// ─── Metric display helpers ───────────────────────────────────────────────────

type MetricKey = keyof ScreenerResults;

/** Format a result value according to its MetricConfig unit + decimals. */
function fmtMetric(key: MetricKey, value: number | null): string {
  if (value === null) return NULL_DISPLAY;
  const cfg = SCREENER_METRIC_CONFIG[key];
  const dec = cfg.decimals ?? 2;
  const unit = cfg.unit ?? '';

  if (unit === '$' || unit === '$/mo' || unit === '$/yr') {
    return fmtCurrency(value, dec > 0);
  }
  if (unit === '%') return fmtPercent(value, dec);
  if (unit === '×') return fmtMultiplier(value, dec);
  return fmtNumber(value, dec);
}

/** Returns the signal class for a metric value: pass / fail / neutral. */
function signalClass(key: MetricKey, value: number | null): string {
  if (value === null) return 'text-null';
  const cfg = SCREENER_METRIC_CONFIG[key];
  if (cfg.direction === 'none' || cfg.threshold === undefined) return 'text-hi';
  const passes =
    cfg.direction === 'higher' ? value >= cfg.threshold : value <= cfg.threshold;
  return passes ? 'text-pass' : 'text-fail';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface MetricRowProps {
  metricKey: MetricKey;
  result: ScreenerResults;
  /** Override label from config */
  label?: string;
}

function MetricRow({ metricKey, result, label }: MetricRowProps) {
  const cfg = SCREENER_METRIC_CONFIG[metricKey];
  const value = result[metricKey];
  const valueClass = signalClass(metricKey, value);
  const displayLabel = label ?? cfg.label;

  return (
    <div className="flex items-baseline justify-between gap-2 py-1.5 border-b border-border last:border-b-0">
      <span
        className="text-xs text-mid flex-1 truncate"
        title={cfg.description}
      >
        {displayLabel}
      </span>
      <span className={`num text-sm font-mono tabular-nums ${valueClass}`}>
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
      <div className="px-4 py-1">{children}</div>
    </div>
  );
}

// ─── Results panel ────────────────────────────────────────────────────────────

interface ResultsPanelProps {
  results: ScreenerResults;
}

/**
 * Results display for RPE-19 — functional but minimal.
 * RPE-20 adds full threshold tooltips, animated indicators, and scenario comparison.
 */
function ResultsPanel({ results }: ResultsPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* ── Investment snapshot ──────────────────────────────────────────── */}
      <ResultGroup title="Returns">
        <MetricRow metricKey="capRate" result={results} />
        <MetricRow metricKey="cocRoi" result={results} />
        <MetricRow metricKey="cashFlowMonthly" result={results} label="Cash Flow / mo" />
        <MetricRow metricKey="cashFlowAnnual" result={results} label="Cash Flow / yr" />
      </ResultGroup>

      {/* ── Deal quality ─────────────────────────────────────────────────── */}
      <ResultGroup title="Deal Quality">
        <MetricRow metricKey="dscr" result={results} />
        <MetricRow metricKey="onePercentRule" result={results} label="1% Rule" />
        <MetricRow metricKey="grm" result={results} />
        <MetricRow metricKey="grossYield" result={results} />
        <MetricRow metricKey="breakEvenOccupancy" result={results} />
        <MetricRow metricKey="expenseRatio" result={results} />
        <MetricRow metricKey="fiftyPctRuleDeviation" result={results} label="50% Rule Dev." />
      </ResultGroup>

      {/* ── Income & expenses ────────────────────────────────────────────── */}
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

// ─── Main Evaluator component ─────────────────────────────────────────────────

/**
 * Top-level SPA component.
 *
 * Owns the entire deal state via `useReducer`.
 * Runs `evaluate()` synchronously via `useEvaluate` (memoized on state reference).
 * Renders the inputs panel (left) and results panel (right) in a two-column layout.
 */
export function Evaluator() {
  const [state, dispatch] = useReducer(dealReducer, DEFAULT_INPUTS);
  const results = useEvaluate(state);

  return (
    <div className="min-h-dvh bg-base text-hi flex flex-col">
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
            focus-visible:outline focus-visible:outline-accent
            transition-colors
          "
        >
          Reset
        </button>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col lg:grid lg:grid-cols-[380px_1fr] overflow-hidden">
        {/* Left — inputs */}
        <aside className="overflow-y-auto border-b border-border lg:border-b-0 lg:border-r lg:border-border">
          <DealInputsForm state={state} dispatch={dispatch} />
        </aside>

        {/* Right — results */}
        <section className="overflow-y-auto p-5">
          <ResultsPanel results={results} />
        </section>
      </div>
    </div>
  );
}
