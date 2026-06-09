import { useMemo, useState, useCallback } from 'react';
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
import { ComparisonPanel } from './components/ComparisonPanel';
import { AmortizationPanel } from './components/AmortizationPanel';
import { ProFormaPanel } from './components/ProFormaPanel';
import { fmtCurrency, fmtPercent, fmtNumber, fmtMultiplier, NULL_DISPLAY } from './utils/format';
import type { SavedDeal } from './state/savedDealsSchema';
import { SIMPLE_RESULT_KEYS, type UiMode } from './state/uiMode';
import { applySimpleBaselines } from './state/simpleBaselines';
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
        <span className="text-xs text-mid truncate block" title={cfg.description}>
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

function ScoreCard({ result, uiMode = 'complex' }: { result: ScreenerResults; uiMode?: UiMode }) {
  const scoredKeys = uiMode === 'simple' ? SIMPLE_SCORED_KEYS : SCORED_KEYS;
  const signals = scoredKeys.map((k) => evalSignal(k, result[k]));
  const total = signals.filter((s) => s !== 'null').length;
  const passing = signals.filter((s) => s === 'pass').length;
  const pct = total > 0 ? (passing / total) * 100 : 0;
  const scoreColor = pct >= 75 ? 'text-pass' : pct >= 50 ? 'text-warn' : 'text-fail';

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
          className={`h-full rounded-full transition-all ${pct >= 75 ? 'bg-pass' : pct >= 50 ? 'bg-warn' : 'bg-fail'}`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={passing}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label={`${passing} of ${total} metrics passing`}
        />
      </div>
      <p className="text-[10px] text-lo mt-1.5">metrics meeting conventional thresholds</p>
    </div>
  );
}

function ResultsPanel({ results, uiMode = 'complex' }: { results: ScreenerResults; uiMode?: UiMode }) {
  const simple = uiMode === 'simple';

  return (
    <div className="flex flex-col gap-4">
      <ScoreCard result={results} uiMode={uiMode} />

      {/* ── Assumptions badge (simple mode) ──────────────────────────────────── */}
      {simple && (
        <div
          className="rounded border border-border bg-raised px-4 py-2 text-xs text-lo italic"
          role="note"
          aria-label="Results based on assumptions"
        >
          Results estimated using national-average financing and expense assumptions.
          Switch to Complex mode to use your own figures.
        </div>
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
          className={`px-3 py-1.5 uppercase tracking-widest transition-colors ${
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
          className={`px-3 py-1.5 uppercase tracking-widest transition-colors border-l border-border ${
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
        className={`px-3 py-1.5 uppercase tracking-widest transition-colors ${
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
        className={`px-3 py-1.5 uppercase tracking-widest transition-colors border-l border-border ${
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
        rounded border border-border px-3 py-1.5
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
export function Evaluator({ adConfig }: { adConfig?: AdConfig }) {
  const {
    scenarios,
    activeIdx,
    setActiveIdx,
    activeInputs,
    dispatchToActive,
    addScenario,
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
   * Persisted to localStorage as 'rpe_location'.
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
  const resultsList = useMemo(
    () =>
      scenarios.map((s) =>
        evaluate(
          uiMode === 'simple' ? applySimpleBaselines(s.inputs) : s.inputs,
        ) as ScreenerResults,
      ),
    [scenarios, uiMode],
  );

  const activeResults =
    resultsList[activeIdx] ??
    (evaluate(
      uiMode === 'simple' ? applySimpleBaselines(activeInputs) : activeInputs,
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
        uiMode === 'simple' ? applySimpleBaselines(activeInputs) : activeInputs,
      ),
    [activeInputs, uiMode],
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
    <div className="h-dvh bg-base text-hi flex flex-col">
      {/* ── Skip navigation ── */}
      <a
        href="#results"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-raised focus:px-3 focus:py-1.5 focus:text-xs focus:text-accent"
      >
        Skip to results
      </a>

      {/* ── Header ── */}
      <header className="shrink-0 flex items-center justify-between gap-4 border-b border-border bg-base px-5 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-xl tracking-wide text-hi">
            Rental Property Evaluator
          </h1>
          <span className="hidden text-xs text-lo sm:inline">{proFormaMode ? 'Pro-Forma' : 'Screener'}</span>
        </div>
        <div className="no-print flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="
              rounded border border-border px-3 py-1.5
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
              rounded border border-border px-3 py-1.5
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
              rounded border border-border px-3 py-1.5
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
              rounded border border-border px-3 py-1.5
              text-xs text-mid uppercase tracking-widest
              hover:border-accent hover:text-accent
              transition-colors
            "
          >
            Reset
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <main className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-[380px_1fr]">
        {/* Left — inputs (hidden in print) */}
        <aside
          aria-label="Deal inputs"
          className="no-print flex flex-col overflow-hidden border-b border-border lg:border-b-0 lg:border-r lg:border-border"
        >
          <ScenarioTabs
            scenarios={scenarios}
            activeIdx={activeIdx}
            onSelect={setActiveIdx}
            onAdd={addScenario}
            onRemove={removeScenario}
            onRename={renameScenario}
          />
          <div className="flex-1 overflow-y-auto">
            <DealInputsForm
              state={activeInputs}
              dispatch={dispatchToActive}
              proFormaMode={proFormaMode}
              uiMode={uiMode}
              apiKey={apiKey}
              apiUrl={apiUrl}
              location={location}
              locationResolving={false}
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
          className="overflow-y-auto p-5"
        >
          {proFormaMode && proFormaResults ? (
            <ProFormaPanel results={proFormaResults} purchasePrice={activeNormalized.purchasePrice} />
          ) : isComparing ? (
            <ComparisonPanel scenarios={scenarios} resultsList={resultsList} />
          ) : (
            <div className="flex flex-col gap-4">
              <ResultsPanel results={activeResults} uiMode={uiMode} />
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

