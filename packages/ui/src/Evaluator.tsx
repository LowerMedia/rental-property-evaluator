import { useMemo, useState, useCallback, useEffect } from 'react';
import { evaluate, SCREENER_METRIC_CONFIG, calcLoanAmount, normalizeInputs } from '@rpe/engine';
import type { DealInputs, ScreenerResults, ProFormaResults } from '@rpe/engine';
import { useSavedDeals } from './hooks/useSavedDeals';
import { useScenarios } from './hooks/useScenarios';
import { buildShareUrl } from './utils/shareUrl';
import { exportToCsv } from './utils/exportCsv';
import { AdSlot } from './components/AdSlot';
import { DealInputsForm } from './components/inputs/DealInputsForm';
import { SavedDealsPanel } from './components/SavedDealsPanel';
import { ScenarioTabs } from './components/ScenarioTabs';
import { ThemeToggle } from './components/ThemeToggle';
import { AuthProvider } from './state/AuthContext';
import { AccountMenu } from './components/auth/AccountMenu';
import { AuthScreen } from './components/auth/AuthScreen';
import { ComparisonPanel } from './components/ComparisonPanel';
import { AmortizationPanel } from './components/AmortizationPanel';
import { ProFormaPanel } from './components/ProFormaPanel';
import { fmtCurrency, fmtPercent, fmtNumber, fmtMultiplier, NULL_DISPLAY } from './utils/format';
import type { SavedDeal } from './state/savedDealsSchema';
import { SIMPLE_RESULT_KEYS, type UiMode } from './state/uiMode';
import { applySimpleBaselines, getSimpleBaselines, BASELINE_DESCRIPTIONS, type LocationRateOverrides } from './state/simpleBaselines';
import { useLocationDefaults } from './hooks/useLocationDefaults';
import { ConnectorSettingsModal } from './components/ConnectorSettingsModal';
import { getRentCastKey } from './state/connectorStorage';
import {
  type LocationState,
  DEFAULT_LOCATION,
  loadLocation,
  saveLocation,
  clearLocationStorage,
} from './state/locationState';

// ─── Metric helpers ───────────────────────────────────────────────────────────

type MetricKey = keyof ScreenerResults;

/** Format a result value per its MetricConfig unit + decimals. */
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

function evalSignal(key: MetricKey, value: number | null): 'pass' | 'fail' | 'null' | 'neutral' {
  if (value === null) return 'null';
  const cfg = SCREENER_METRIC_CONFIG[key];
  if (cfg.direction === 'none' || cfg.threshold === undefined) return 'neutral';
  return cfg.direction === 'higher'
    ? value >= cfg.threshold ? 'pass' : 'fail'
    : value <= cfg.threshold ? 'pass' : 'fail';
}

const SIGNAL_CLASS: Record<ReturnType<typeof evalSignal>, string> = {
  pass: 'text-pass',
  fail: 'text-fail',
  null: 'text-null',
  neutral: 'text-hi',
};

const DOT_CLASS: Record<ReturnType<typeof evalSignal>, string> = {
  pass: 'bg-pass',
  fail: 'bg-fail',
  null: 'bg-null',
  neutral: 'bg-muted',
};

function thresholdNote(key: MetricKey, signal: ReturnType<typeof evalSignal>): string | null {
  if (signal !== 'fail') return null;
  const cfg = SCREENER_METRIC_CONFIG[key];
  if (cfg.threshold === undefined) return null;
  const dir = cfg.direction === 'higher' ? '≥' : '≤';
  const dec = cfg.decimals ?? 1;
  const unit = cfg.unit ?? '';
  const val =
    unit === '%' ? fmtPercent(cfg.threshold, dec)
    : unit === '×' ? fmtMultiplier(cfg.threshold, dec)
    : unit === '$' || unit === '$/mo' || unit === '$/yr' || unit === '$/sqft'
      ? fmtCurrency(cfg.threshold, dec > 0)
    : fmtNumber(cfg.threshold, dec);
  return `needs ${dir} ${val}`;
}

// ─── Single-scenario sub-components ──────────────────────────────────────────

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
      <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${DOT_CLASS[signal]}`} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        {/* Keyboard-focusable + screen-reader-accessible metric tooltip (RPE-118):
            cfg.description carries the formula + definition; tabIndex + aria-label
            make it reachable without a mouse, focus-visible ring shows focus. */}
        <span
          className="block cursor-help truncate rounded-sm text-xs text-mid outline-none focus-visible:ring-1 focus-visible:ring-accent"
          tabIndex={0}
          title={cfg.description}
          aria-label={`${displayLabel}: ${cfg.description}`}
        >
          {displayLabel}
        </span>
        {note && (
          <span className="text-[10px] text-fail/70 block leading-tight">{note}</span>
        )}
      </div>
      <span className={`num text-sm font-mono tabular-nums shrink-0 ${SIGNAL_CLASS[signal]}`}>
        {fmtMetric(metricKey, value)}
      </span>
    </div>
  );
}

function ResultGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-border bg-surface overflow-hidden">
      <div className="px-4 py-2 border-b border-border bg-raised">
        <h3 className="section-title text-xs">{title}</h3>
      </div>
      <div className="px-4 py-0">{children}</div>
    </div>
  );
}

/**
 * All scored metric keys (direction !== 'none') — used by the full ScoreCard in complex mode.
 */
const SCORED_KEYS: MetricKey[] = (
  Object.entries(SCREENER_METRIC_CONFIG) as [MetricKey, (typeof SCREENER_METRIC_CONFIG)[MetricKey]][]
)
  .filter(([, cfg]) => cfg.direction !== 'none')
  .map(([key]) => key);

/**
 * Scored keys visible in simple mode — intersection of SCORED_KEYS and SIMPLE_RESULT_KEYS.
 *
 * Not every simple-tier metric has a pass/fail threshold: metrics with direction='none'
 * in SCREENER_METRIC_CONFIG (e.g. totalCashInvested) are absent from SCORED_KEYS and
 * therefore absent here too. ScoreCard uses this set in simple mode so the score
 * denominator reflects the visible, scoreable subset rather than the full complex set.
 */
const SIMPLE_SCORED_KEYS: MetricKey[] = SCORED_KEYS.filter((k) =>
  SIMPLE_RESULT_KEYS.includes(k),
);

/** Threshold display: "≥ 5%", "≤ 12×", "≥ $0" — driven entirely by config. */
function fmtThreshold(cfg: (typeof SCREENER_METRIC_CONFIG)[MetricKey]): string {
  const symbol = cfg.direction === 'higher' ? '≥' : '≤';
  const t = cfg.threshold ?? 0;
  const value = cfg.unit === '$' ? `$${t.toLocaleString()}` : `${t}${cfg.unit ?? ''}`;
  return `${symbol} ${value}`;
}

/**
 * Score = passing ÷ scored metrics (the visible subset in simple mode).
 * Single source of truth for both the full ScoreCard and the mobile
 * StickyScoreBar (RPE-112).
 */
function computeScore(result: ScreenerResults, uiMode: UiMode) {
  const scoredKeys = uiMode === 'simple' ? SIMPLE_SCORED_KEYS : SCORED_KEYS;
  const signals = scoredKeys.map((k) => evalSignal(k, result[k]));
  const total = signals.filter((s) => s !== 'null').length;
  const passing = signals.filter((s) => s === 'pass').length;
  const pct = total > 0 ? (passing / total) * 100 : 0;
  return { scoredKeys, total, passing, pct };
}

/** Score band → Tailwind tokens. ≥75% green, ≥50% amber, below red. */
function scoreBand(pct: number): { text: string; bg: string } {
  if (pct >= 75) return { text: 'text-pass', bg: 'bg-pass' };
  if (pct >= 50) return { text: 'text-warn', bg: 'bg-warn' };
  return { text: 'text-fail', bg: 'bg-fail' };
}

function ScoreCard({ result, uiMode = 'complex' }: { result: ScreenerResults; uiMode?: UiMode }) {
  const [explainOpen, setExplainOpen] = useState(false);
  const { scoredKeys, total, passing, pct } = computeScore(result, uiMode);
  const scoreColor = scoreBand(pct).text;

  return (
    <div className="rounded border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between mb-2">
        <span className="section-title text-xs">Score</span>
        <span className={`num text-lg font-mono ${scoreColor}`}>
          {passing}<span className="text-lo text-sm">/{total}</span>
        </span>
      </div>
      <div className="h-1 rounded-full bg-raised overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${scoreBand(pct).bg}`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={passing}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label={`${passing} of ${total} metrics passing`}
        />
      </div>
      <p className="text-[10px] text-lo mt-1.5">metrics meeting conventional thresholds</p>

      {/* ── Score explanation disclosure (RPE-70) — never printed ───────────── */}
      <button
        type="button"
        onClick={() => setExplainOpen((open) => !open)}
        aria-expanded={explainOpen}
        aria-controls="score-explanation"
        className="no-print mt-2 text-[10px] text-lo hover:text-accent transition-colors"
      >
        {explainOpen ? '▾' : '▸'} How is this scored?
      </button>
      {explainOpen && (
        <div id="score-explanation" className="no-print mt-2 space-y-1">
          {scoredKeys.map((key) => {
            const cfg = SCREENER_METRIC_CONFIG[key];
            const signal = evalSignal(key, result[key]);
            return (
              <div key={key} className="grid grid-cols-[1fr_auto_auto] gap-2 text-[10px] items-baseline">
                <span className="text-mid">{cfg.label}</span>
                <span className="text-lo font-mono">{fmtThreshold(cfg)}</span>
                <span
                  className={
                    signal === 'pass' ? 'text-pass' : signal === 'fail' ? 'text-fail' : 'text-lo'
                  }
                >
                  {signal === 'pass' ? 'pass' : signal === 'fail' ? 'fail' : '—'}
                </span>
              </div>
            );
          })}
          <p className="text-[10px] text-lo pt-1 border-t border-border">
            Score = passing ÷ scored. ≥75% green, ≥50% amber, below red. Informational
            metrics (no threshold) are not counted.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * RPE-112 — compact, mobile-only score summary pinned to the top of the page
 * so the headline result stays visible while the inputs are scrolled. Hidden
 * at lg, where the two-pane layout keeps the full ScoreCard in view. The whole
 * bar links to the full results. Banding mirrors ScoreCard via scoreBand().
 */
function StickyScoreBar({ result, uiMode }: { result: ScreenerResults; uiMode: UiMode }) {
  const { total, passing, pct } = computeScore(result, uiMode);
  const band = scoreBand(pct);
  return (
    <a
      href="#results"
      className="no-print lg:hidden sticky top-0 z-20 flex min-h-[44px] items-center justify-between gap-4 border-b border-border bg-base px-5 py-2"
      aria-label={`Score: ${passing} of ${total} metrics passing. Jump to results.`}
    >
      <span className="flex items-baseline gap-2">
        <span className="section-title text-xs">Score</span>
        <span className={`num font-mono text-base ${band.text}`}>
          {passing}
          <span className="text-lo text-xs">/{total}</span>
        </span>
      </span>
      <span className="flex max-w-[45%] flex-1 items-center gap-2">
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-raised">
          <span
            className={`block h-full rounded-full transition-all ${band.bg}`}
            style={{ width: `${pct}%` }}
          />
        </span>
        <span className="whitespace-nowrap text-[10px] uppercase tracking-widest text-lo">Results ↓</span>
      </span>
    </a>
  );
}

/** Whole-dollar currency formatter for assumption amounts. */
const assumptionMoney = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/**
 * Simple-mode assumptions (RPE-119). Collapsed to the legacy one-line note;
 * expands to the live baseline values driving the estimate (tax & insurance
 * reflect the resolved ZIP when a location is set). Native <details> gives a
 * keyboard-accessible disclosure for free.
 */
function AssumptionsAccordion({
  purchasePrice,
  rateOverrides,
  sourceLabel,
}: {
  purchasePrice: number;
  rateOverrides?: LocationRateOverrides;
  sourceLabel?: string;
}) {
  const b = getSimpleBaselines(purchasePrice, rateOverrides);
  const rows: Array<{ label: string; value: string; desc: string }> = [
    { label: 'Interest rate', value: `${b.interestRate.toFixed(1)}%`, desc: BASELINE_DESCRIPTIONS.interestRate },
    { label: 'Loan term', value: `${b.loanTermYears} yr`, desc: BASELINE_DESCRIPTIONS.loanTermYears },
    { label: 'Closing costs', value: assumptionMoney.format(b.closingCosts), desc: BASELINE_DESCRIPTIONS.closingCosts },
    { label: 'Vacancy', value: `${b.vacancyPct}%`, desc: BASELINE_DESCRIPTIONS.vacancyPct },
    { label: 'CapEx', value: `${b.expenses.capExPct}%`, desc: BASELINE_DESCRIPTIONS.capExPct },
    { label: 'Maintenance', value: `${b.expenses.maintPct}%`, desc: BASELINE_DESCRIPTIONS.maintPct },
    { label: 'Management', value: `${b.expenses.mgmtPct}%`, desc: BASELINE_DESCRIPTIONS.mgmtPct },
    { label: 'Misc', value: `${b.expenses.miscPct}%`, desc: BASELINE_DESCRIPTIONS.miscPct },
    { label: 'Property tax', value: `${assumptionMoney.format(b.expenses.taxes.amount)}/yr`, desc: BASELINE_DESCRIPTIONS.taxes },
    { label: 'Insurance', value: `${assumptionMoney.format(b.expenses.insurance.amount)}/yr`, desc: BASELINE_DESCRIPTIONS.insurance },
  ];

  return (
    <details className="group rounded border border-border bg-raised text-xs" role="note">
      <summary className="flex cursor-pointer list-none items-start gap-1.5 px-4 py-2 italic text-lo marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="mt-0.5 transition-transform group-open:rotate-90" aria-hidden="true">▸</span>
        <span>
          Results estimated using national-average financing and expense assumptions.
          {rateOverrides ? ' Tax & insurance are localized to your ZIP.' : ''} Switch to Complex mode to use your own figures.
        </span>
      </summary>
      <div className="border-t border-border px-4 py-3 not-italic">
        {sourceLabel && <p className="mb-2 text-lo">📊 {sourceLabel}</p>}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between gap-2" title={r.desc}>
              <dt className="text-lo">{r.label}</dt>
              <dd className="tabular-nums text-mid">{r.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}

function ResultsPanel({
  results,
  uiMode = 'complex',
  purchasePrice = 0,
  rateOverrides,
  sourceLabel,
}: {
  results: ScreenerResults;
  uiMode?: UiMode;
  /** Drives the live baseline values shown in the simple-mode assumptions accordion (RPE-119). */
  purchasePrice?: number;
  rateOverrides?: LocationRateOverrides;
  sourceLabel?: string;
}) {
  const simple = uiMode === 'simple';

  return (
    <div className="flex flex-col gap-4">
      <ScoreCard result={results} uiMode={uiMode} />

      {/* ── Assumptions accordion (simple mode, RPE-119) ─────────────────────── */}
      {simple && (
        <AssumptionsAccordion purchasePrice={purchasePrice} rateOverrides={rateOverrides} sourceLabel={sourceLabel} />
      )}

      {/* ── Returns ──────────────────────────────────────────────────────────── */}
      <ResultGroup title="Returns">
        <MetricRow metricKey="capRate" result={results} />
        <MetricRow metricKey="cocRoi" result={results} />
        <MetricRow metricKey="cashFlowMonthly" result={results} label="Cash Flow / mo" />
        <MetricRow metricKey="cashFlowAnnual" result={results} label="Cash Flow / yr" />
      </ResultGroup>

      {/* ── Deal Quality ─────────────────────────────────────────────────────── */}
      <ResultGroup title="Deal Quality">
        <MetricRow metricKey="dscr" result={results} />
        <MetricRow metricKey="onePercentRule" result={results} label="1% Rule" />
        {!simple && <MetricRow metricKey="grm" result={results} />}
        {!simple && <MetricRow metricKey="grossYield" result={results} />}
        <MetricRow metricKey="breakEvenOccupancy" result={results} />
        {!simple && <MetricRow metricKey="expenseRatio" result={results} />}
        {!simple && <MetricRow metricKey="fiftyPctRuleDeviation" result={results} label="50% Rule Dev." />}
      </ResultGroup>

      {/* ── Income & Expenses (complex only) ─────────────────────────────────── */}
      {!simple && (
        <ResultGroup title="Income & Expenses">
          <MetricRow metricKey="egi" result={results} label="EGI / mo" />
          <MetricRow metricKey="egiAnnual" result={results} label="EGI / yr" />
          <MetricRow metricKey="noiMonthly" result={results} label="NOI / mo" />
          <MetricRow metricKey="noiAnnual" result={results} label="NOI / yr" />
          <MetricRow metricKey="opExMonthly" result={results} label="OpEx / mo" />
          <MetricRow metricKey="opExAnnual" result={results} label="OpEx / yr" />
          <MetricRow metricKey="piti" result={results} label="PITI / mo" />
        </ResultGroup>
      )}

      {/* ── Loan (complex only) ──────────────────────────────────────────────── */}
      {!simple && (
        <ResultGroup title="Loan">
          <MetricRow metricKey="loanAmount" result={results} />
          <MetricRow metricKey="mortgagePayment" result={results} label="P&I / mo" />
          <MetricRow metricKey="ltv" result={results} />
          <MetricRow metricKey="debtYield" result={results} />
          <MetricRow metricKey="totalInterest" result={results} />
        </ResultGroup>
      )}

      {/* ── Capital ──────────────────────────────────────────────────────────── */}
      <ResultGroup title="Capital">
        <MetricRow metricKey="totalCashInvested" result={results} label="Total Cash In" />
        {!simple && results.pricePerUnit !== null && (
          <MetricRow metricKey="pricePerUnit" result={results} />
        )}
        {!simple && results.pricePerSqft !== null && (
          <MetricRow metricKey="pricePerSqft" result={results} />
        )}
      </ResultGroup>
    </div>
  );
}

// ─── Mode toggles ─────────────────────────────────────────────────────────────

interface ModeToggleProps {
  proFormaMode: boolean;
  onChange: (pf: boolean) => void;
  /** When true, the Pro-Forma button is disabled (simple mode requires complex inputs). */
  disableProForma?: boolean;
}

function ModeToggle({ proFormaMode, onChange, disableProForma = false }: ModeToggleProps) {
  return (
    <>
      {/*
        Off-screen hint referenced by aria-describedby on the disabled Pro-Forma
        button. Browser `title` tooltips are suppressed on disabled controls in
        many user agents and are never announced by screen readers.
      */}
      {disableProForma && (
        <span id="proforma-disabled-hint" className="sr-only">
          Pro-Forma requires Complex mode. Switch to Complex mode to enable it.
        </span>
      )}
      <div
        className="flex rounded border border-border text-xs overflow-hidden"
        role="group"
        aria-label="Evaluation mode"
      >
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`px-3 py-1.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center sm:min-h-0 sm:min-w-0 uppercase tracking-widest transition-colors ${
            !proFormaMode
              ? 'bg-accent text-base font-semibold'
              : 'text-lo hover:text-mid hover:bg-raised'
          }`}
          aria-pressed={!proFormaMode}
        >
          Screener
        </button>
        <button
          type="button"
          onClick={() => !disableProForma && onChange(true)}
          disabled={disableProForma}
          className={`px-3 py-1.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center sm:min-h-0 sm:min-w-0 uppercase tracking-widest transition-colors border-l border-border ${
            disableProForma
              ? 'text-lo/40 cursor-not-allowed'
              : proFormaMode
                ? 'bg-accent text-base font-semibold'
                : 'text-lo hover:text-mid hover:bg-raised'
          }`}
          aria-pressed={proFormaMode}
          aria-disabled={disableProForma}
          aria-describedby={disableProForma ? 'proforma-disabled-hint' : undefined}
        >
          Pro-Forma
        </button>
      </div>
    </>
  );
}

interface UiModeToggleProps {
  uiMode: UiMode;
  onChange: (mode: UiMode) => void;
}

/**
 * Simple / Complex mode selector.
 * Simple mode shows 4 core inputs and 8 headline metrics; all other fields
 * are hidden and supplied by national-average baseline assumptions.
 */
function UiModeToggle({ uiMode, onChange }: UiModeToggleProps) {
  return (
    <div
      className="flex rounded border border-border text-xs overflow-hidden"
      role="group"
      aria-label="Input complexity"
    >
      <button
        type="button"
        onClick={() => onChange('simple')}
        className={`px-3 py-1.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center sm:min-h-0 sm:min-w-0 uppercase tracking-widest transition-colors ${
          uiMode === 'simple'
            ? 'bg-accent text-base font-semibold'
            : 'text-lo hover:text-mid hover:bg-raised'
        }`}
        aria-pressed={uiMode === 'simple'}
      >
        Simple
      </button>
      <button
        type="button"
        onClick={() => onChange('complex')}
        className={`px-3 py-1.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center sm:min-h-0 sm:min-w-0 uppercase tracking-widest transition-colors border-l border-border ${
          uiMode === 'complex'
            ? 'bg-accent text-base font-semibold'
            : 'text-lo hover:text-mid hover:bg-raised'
        }`}
        aria-pressed={uiMode === 'complex'}
      >
        Complex
      </button>
    </div>
  );
}

// ─── Share button ─────────────────────────────────────────────────────────────

function ShareButton({ inputs }: { inputs: DealInputs }) {
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    const url = buildShareUrl(inputs);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback: open prompt with URL for environments without clipboard API
      window.prompt('Copy this link to share the current scenario:', url);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [inputs]);

  return (
    <button
      type="button"
      onClick={() => void handleShare()}
      className="
        rounded border border-border px-3 py-1.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center sm:min-h-0 sm:min-w-0
        text-xs text-mid uppercase tracking-widest
        hover:border-accent hover:text-accent
        transition-colors
      "
      title="Copy a shareable link to the current scenario"
    >
      {copied ? 'Copied ✓' : 'Share'}
    </button>
  );
}

// ─── Main Evaluator ───────────────────────────────────────────────────────────

/**
 * Ad configuration for gated ad slots (RPE-39).
 * Omit entirely to render zero ad-related markup — the WP block never
 * passes this prop, keeping embedded usage completely ad-free.
 */
export interface AdConfig {
  /** AdSense publisher client ID — ca-pub-XXXXXXXXXXXXXXXX. */
  client: string;
  /** Ad slot ID for the unit displayed in the results panel. */
  resultsSlot: string;
}

/**
 * Top-level SPA component.
 *
 * Single scenario: standard two-panel layout (inputs | ResultsPanel).
 * 2–4 scenarios: ScenarioTabs on the inputs panel + ComparisonPanel on the right.
 */
export interface EvaluatorProps {
  adConfig?: AdConfig;
  /** E11 (RPE-96): mount the cookie-session auth shell — login/register/
   * reset screens on hash routes, account menu, org switcher. OFF by
   * default so embeds (WP block) keep the tool fully public. */
  authEnabled?: boolean;
}

export function Evaluator({ adConfig, authEnabled = false }: EvaluatorProps) {
  if (authEnabled) {
    return (
      <AuthProvider>
        <EvaluatorInner adConfig={adConfig} authEnabled />
      </AuthProvider>
    );
  }
  return <EvaluatorInner adConfig={adConfig} authEnabled={false} />;
}

function EvaluatorInner({ adConfig, authEnabled }: { adConfig?: AdConfig; authEnabled: boolean }) {
  const {
    scenarios,
    activeIdx,
    setActiveIdx,
    activeInputs,
    dispatchToActive,
    addScenario,
    addExampleScenario,
    removeScenario,
    renameScenario,
    replaceScenarioInputs,
  } = useScenarios();

  const { deals, save, rename, remove } = useSavedDeals();

  const [proFormaMode, setProFormaMode] = useState(false);

  /**
   * UI complexity mode — 'simple' hides advanced inputs and results and
   * evaluates using national-average baseline assumptions for hidden fields.
   * ComparisonPanel and ProFormaPanel are not uiMode-aware (E8 does not
   * require them to be).
   */
  const [uiMode, setUiMode] = useState<UiMode>('complex');

  /**
   * Switch UI mode. Switching to simple also forces screener mode because
   * pro-forma requires the complex-tier inputs that are hidden in simple mode.
   */
  const handleSetUiMode = useCallback((mode: UiMode) => {
    setUiMode(mode);
    if (mode === 'simple' && proFormaMode) {
      setProFormaMode(false);
    }
  }, [proFormaMode]);

  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(() => getRentCastKey());

  const apiUrl =
    (import.meta as { env?: { VITE_API_URL?: string } }).env?.['VITE_API_URL'] ??
    'http://localhost:3001';

  // Refresh apiKey after the modal closes (user may have saved or removed)
  const handleCloseSettings = useCallback(() => {
    setShowSettings(false);
    setApiKey(getRentCastKey());
  }, []);

  /**
   * Location state for regional assumption defaults (RPE-64).
   * zip='' means no location set. stateCode/label are populated after API resolution.
   * Persisted to localStorage under locationState's STORAGE_KEY.
   */
  const [location, setLocation] = useState<LocationState>(() => loadLocation());

  const handleZipChange = useCallback((zip: string) => {
    const pending: LocationState = { zip, stateCode: '', label: '' };
    setLocation(pending);
    saveLocation(pending);
  }, []);

  const handleLocationClear = useCallback(() => {
    setLocation(DEFAULT_LOCATION);
    clearLocationStorage();
  }, []);

  /**
   * useLocationDefaults — fetches regional rates for the current ZIP (RPE-66).
   * When zip is '' (no location), returns no rates and resolving=false.
   */
  const {
    rates: locationRates,
    resolving: locationResolving,
    failed: locationLookupFailed,
    stateCode: resolvedStateCode,
    label: resolvedLabel,
  } = useLocationDefaults(location.zip, apiUrl);

  /**
   * Sync resolved stateCode/label back into persisted location state.
   * Runs when the hook resolves a new ZIP so the chip shows the resolved label
   * and localStorage stays up to date.
   */
  useEffect(() => {
    if (
      location.zip &&
      resolvedStateCode &&
      // Sync when either field drifts — a stored location can have the right
      // stateCode but a stale/empty label (e.g. API label format changed)
      (resolvedStateCode !== location.stateCode || resolvedLabel !== location.label)
    ) {
      const resolved: LocationState = {
        zip: location.zip,
        stateCode: resolvedStateCode,
        label: resolvedLabel,
      };
      setLocation(resolved);
      saveLocation(resolved);
    }
  }, [location.zip, location.stateCode, location.label, resolvedStateCode, resolvedLabel]);

  /** Seed pro-forma defaults into state the first time the user enters pro-forma mode. */
  const handleSetProFormaMode = useCallback((pf: boolean) => {
    setProFormaMode(pf);
    if (pf) {
      // Only dispatch defaults for fields that are currently undefined/absent so we
      // don't overwrite values the user has already entered.
      if (activeInputs.holdYears === undefined)
        dispatchToActive({ type: 'SET_NUMBER', field: 'holdYears', value: 5 });
      if (activeInputs.rentGrowthPct === undefined)
        dispatchToActive({ type: 'SET_NUMBER', field: 'rentGrowthPct', value: 2 });
      if (activeInputs.expenseGrowthPct === undefined)
        dispatchToActive({ type: 'SET_NUMBER', field: 'expenseGrowthPct', value: 2 });
      if (activeInputs.appreciationPct === undefined)
        dispatchToActive({ type: 'SET_NUMBER', field: 'appreciationPct', value: 3 });
      if (activeInputs.sellingCostsPct === undefined)
        dispatchToActive({ type: 'SET_NUMBER', field: 'sellingCostsPct', value: 6 });
    }
  }, [activeInputs, dispatchToActive]);

  /**
   * Evaluate all scenarios. In simple mode each scenario's inputs are run
   * through applySimpleBaselines() first so the engine receives a fully-
   * populated DealInputs with baseline values for all hidden complex fields.
   */
  // Location rate overrides (null when no location is set or rates not yet loaded).
  // applySimpleBaselines accepts undefined — null → undefined coercion here is intentional.
  const rateOverrides = locationRates ?? undefined;

  const resultsList = useMemo(
    () =>
      scenarios.map((s) =>
        evaluate(
          uiMode === 'simple' ? applySimpleBaselines(s.inputs, rateOverrides) : s.inputs,
        ) as ScreenerResults,
      ),
    [scenarios, uiMode, rateOverrides],
  );

  const activeResults =
    resultsList[activeIdx] ??
    (evaluate(
      uiMode === 'simple' ? applySimpleBaselines(activeInputs, rateOverrides) : activeInputs,
    ) as ScreenerResults);
  const isComparing = scenarios.length > 1;

  /**
   * Normalize the active inputs once. In simple mode the baseline-applied
   * inputs are used so AmortizationPanel and pro-forma calculations reflect
   * the same assumptions as the results panel.
   */
  const activeNormalized = useMemo(
    () =>
      normalizeInputs(
        uiMode === 'simple' ? applySimpleBaselines(activeInputs, rateOverrides) : activeInputs,
      ),
    [activeInputs, uiMode, rateOverrides],
  );
  const proFormaResults = useMemo<ProFormaResults | null>(() => {
    if (!proFormaMode) return null;
    // Strip zero-valued optional rate fields so the engine treats them as "unset"
    // (0 !== undefined in engine checks, but 0% tax/hurdle has no practical meaning).
    const pfInputs: DealInputs = {
      ...activeNormalized,
      marginalTaxPct: activeNormalized.marginalTaxPct || undefined,
      discountRatePct: activeNormalized.discountRatePct || undefined,
    };
    return evaluate(pfInputs, { mode: 'proforma' }) as ProFormaResults;
  }, [proFormaMode, activeNormalized]);

  const handleLoadDeal = (deal: SavedDeal) => {
    replaceScenarioInputs(activeIdx, deal.inputs);
  };

  return (
    <div className="min-h-dvh lg:h-dvh bg-base text-hi flex flex-col">
      {/* ── Skip navigation ── */}
      <a
        href="#results"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-raised focus:px-3 focus:py-1.5 focus:text-xs focus:text-accent"
      >
        Skip to results
      </a>

      {/* ── Header ── */}
      <header className="shrink-0 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border bg-base px-5 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-xl tracking-wide text-hi">
            Rental Property Evaluator
          </h1>
          <span className="hidden text-xs text-lo sm:inline">{proFormaMode ? 'Pro-Forma' : 'Screener'}</span>
        </div>
        <div className="no-print flex flex-wrap items-center justify-end gap-2">
          <ThemeToggle />
          {authEnabled ? <AccountMenu /> : null}
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="
              rounded border border-border px-3 py-1.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center sm:min-h-0 sm:min-w-0
              text-xs text-mid uppercase tracking-widest
              hover:border-accent hover:text-accent
              transition-colors
            "
            aria-label="Open settings"
            title="Settings"
          >
            ⚙
          </button>
          <UiModeToggle uiMode={uiMode} onChange={handleSetUiMode} />
          <ModeToggle
            proFormaMode={proFormaMode}
            onChange={handleSetProFormaMode}
            disableProForma={uiMode === 'simple'}
          />
          <SavedDealsPanel
            currentInputs={activeInputs}
            deals={deals}
            onSave={(name) => save(name, activeInputs)}
            onLoad={handleLoadDeal}
            onDelete={remove}
            onRename={rename}
          />
          <ShareButton inputs={activeInputs} />
          <button
            type="button"
            onClick={() => exportToCsv(scenarios, resultsList)}
            className="
              rounded border border-border px-3 py-1.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center sm:min-h-0 sm:min-w-0
              text-xs text-mid uppercase tracking-widest
              hover:border-accent hover:text-accent
              transition-colors
            "
            title="Download results as CSV"
          >
            CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="
              rounded border border-border px-3 py-1.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center sm:min-h-0 sm:min-w-0
              text-xs text-mid uppercase tracking-widest
              hover:border-accent hover:text-accent
              transition-colors
            "
            title="Print or save as PDF"
          >
            Print
          </button>
          <button
            type="button"
            onClick={() => dispatchToActive({ type: 'RESET' })}
            className="
              rounded border border-border px-3 py-1.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center sm:min-h-0 sm:min-w-0
              text-xs text-mid uppercase tracking-widest
              hover:border-accent hover:text-accent
              transition-colors
            "
          >
            Reset
          </button>
        </div>
      </header>
      {authEnabled ? <AuthScreen /> : null}

      {/* ── Mobile sticky score (RPE-112): keep the headline result visible while
           inputs are scrolled. Only when the single-scenario ScoreCard is the active
           result view; hidden at lg where the results pane is always visible. ── */}
      {!(proFormaMode && proFormaResults) && !isComparing && (
        <StickyScoreBar result={activeResults} uiMode={uiMode} />
      )}

      {/* ── Body ── */}
      <main className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-[380px_1fr]">
        {/* Left — inputs (hidden in print) */}
        <aside
          aria-label="Deal inputs"
          className="no-print flex flex-col lg:overflow-hidden border-b border-border lg:border-b-0 lg:border-r lg:border-border"
        >
          <ScenarioTabs
            scenarios={scenarios}
            activeIdx={activeIdx}
            onSelect={setActiveIdx}
            onAdd={addScenario}
            onAddExample={addExampleScenario}
            onRemove={removeScenario}
            onRename={renameScenario}
          />
          <div className="flex-1 lg:overflow-y-auto">
            <DealInputsForm
              state={activeInputs}
              dispatch={dispatchToActive}
              proFormaMode={proFormaMode}
              uiMode={uiMode}
              apiKey={apiKey}
              apiUrl={apiUrl}
              location={location}
              locationResolving={locationResolving}
              locationLookupFailed={locationLookupFailed}
              locationSourceLabel={locationRates?.sourceLabel}
              regionRates={locationRates}
              onZipChange={handleZipChange}
              onLocationClear={handleLocationClear}
            />
          </div>
        </aside>

        {/* Right — results */}
        <section
          id="results"
          aria-label="Evaluation results"
          aria-live="polite"
          aria-atomic="false"
          className="lg:overflow-y-auto p-5"
        >
          {proFormaMode && proFormaResults ? (
            <ProFormaPanel results={proFormaResults} purchasePrice={activeNormalized.purchasePrice} />
          ) : isComparing ? (
            <ComparisonPanel scenarios={scenarios} resultsList={resultsList} />
          ) : (
            <div className="flex flex-col gap-4">
              <ResultsPanel
                results={activeResults}
                uiMode={uiMode}
                purchasePrice={activeNormalized.purchasePrice}
                rateOverrides={rateOverrides}
                sourceLabel={locationRates?.sourceLabel}
              />
              <AmortizationPanel
                loanAmount={calcLoanAmount(activeNormalized)}
                interestRate={activeNormalized.interestRate}
                loanTermYears={activeNormalized.loanTermYears}
              />
            </div>
          )}

          {/* Gated ad slot — only rendered when adConfig is provided (RPE-39). */}
          {adConfig && (
            <AdSlot
              client={adConfig.client}
              slot={adConfig.resultsSlot}
              className="mt-4"
            />
          )}
        </section>
      </main>

      {showSettings && <ConnectorSettingsModal onClose={handleCloseSettings} />}
    </div>
  );
}

