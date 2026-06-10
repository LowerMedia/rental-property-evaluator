/**
 * E10 — canonical deal report (RPE-77)
 *
 * The JSON shape returned by the public report endpoints and fed to the
 * PDF pipeline. Pure: evaluate() + config-driven metric annotation, no
 * browser APIs. Both modes covered — pro-forma reports embed the
 * projection + hold-period summary.
 */

import {
  evaluate,
  SCREENER_METRIC_CONFIG,
  type DealInputs,
  type MetricDirection,
  type ProFormaResults,
  type ProjectionYear,
  type ScreenerResults,
} from '@rpe/engine';
import { CSV_ROWS, buildCsvRows, fmtMetricRaw, rowsToCsv } from './csv';
import { fmtCurrency, fmtPercent, fmtMultiplier } from './format';

export type MetricSignal = 'pass' | 'fail' | 'info' | 'null';

export interface ReportMetric {
  key: keyof ScreenerResults;
  group: string;
  label: string;
  value: number | null;
  /** Display-formatted value, identical to the CSV/UI rendering. */
  formatted: string;
  direction: MetricDirection;
  threshold: number | null;
  signal: MetricSignal;
}

export interface DealReport {
  meta: {
    reportVersion: 1;
    generatedAt: string;
    engineVersion: string;
    mode: 'screener' | 'proforma';
  };
  inputs: DealInputs;
  score: {
    passing: number;
    total: number;
    /** passing / total × 100, 0 when nothing is scoreable. */
    pct: number;
  };
  metrics: ReportMetric[];
  /** Present only in pro-forma mode. */
  proForma: {
    projection: ProjectionYear[];
    salePrice: number | null;
    sellingCosts: number | null;
    netSaleProceeds: number | null;
    totalProfit: number | null;
    irr: number | null;
    npv: number | null;
    equityMultiple: number | null;
  } | null;
}

export interface BuildReportOptions {
  mode?: 'screener' | 'proforma';
  /** Injectable for deterministic tests; defaults to now. */
  generatedAt?: string;
  /** The API layer passes its package version; defaults to 'unknown'. */
  engineVersion?: string;
}

function signalFor(direction: MetricDirection, threshold: number | undefined, value: number | null): MetricSignal {
  if (direction === 'none') return 'info';
  if (value === null) return 'null';
  const t = threshold ?? 0;
  return (direction === 'higher' ? value >= t : value <= t) ? 'pass' : 'fail';
}

function isProForma(results: ScreenerResults | ProFormaResults): results is ProFormaResults {
  return 'projection' in results;
}

/** Evaluate a deal and assemble the canonical report. */
export function buildReport(inputs: DealInputs, options: BuildReportOptions = {}): DealReport {
  const mode = options.mode ?? 'screener';
  const results = evaluate(inputs, { mode });
  const screener = isProForma(results) ? results.screener : results;

  const metrics: ReportMetric[] = CSV_ROWS.map((row) => {
    const cfg = SCREENER_METRIC_CONFIG[row.key];
    const value = screener[row.key];
    return {
      key: row.key,
      group: row.group,
      label: row.label ?? cfg.label,
      value,
      formatted: fmtMetricRaw(row.key, value),
      direction: cfg.direction,
      threshold: cfg.threshold ?? null,
      signal: signalFor(cfg.direction, cfg.threshold, value),
    };
  });

  const scored = metrics.filter((m) => m.signal === 'pass' || m.signal === 'fail');
  const passing = scored.filter((m) => m.signal === 'pass').length;

  return {
    meta: {
      reportVersion: 1,
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      engineVersion: options.engineVersion ?? 'unknown',
      mode,
    },
    inputs,
    score: {
      passing,
      total: scored.length,
      pct: scored.length > 0 ? (passing / scored.length) * 100 : 0,
    },
    metrics,
    proForma: isProForma(results)
      ? {
          projection: results.projection,
          salePrice: results.salePrice,
          sellingCosts: results.sellingCosts,
          netSaleProceeds: results.netSaleProceeds,
          totalProfit: results.totalProfit,
          irr: results.irr,
          npv: results.npv,
          equityMultiple: results.equityMultiple,
        }
      : null,
  };
}

/** Serialize a report as CSV rows — metrics section, then pro-forma when present. */
export function reportToCsvRows(report: DealReport): string[][] {
  const screenerLike = Object.fromEntries(
    report.metrics.map((m) => [m.key, m.value]),
  ) as unknown as ScreenerResults;

  const rows = buildCsvRows([{ name: 'Value' }], [screenerLike]);

  if (report.proForma !== null && report.proForma.projection.length > 0) {
    rows.push([]);
    rows.push(['Pro-Forma', 'Year', 'Cash Flow', 'NOI', 'Property Value', 'Loan Balance', 'Equity']);
    for (const year of report.proForma.projection) {
      rows.push([
        'Pro-Forma',
        String(year.year),
        fmtCurrency(year.cashFlowAnnual, true),
        fmtCurrency(year.noiAnnual, true),
        fmtCurrency(year.propertyValue),
        fmtCurrency(year.loanBalance),
        fmtCurrency(year.equity),
      ]);
    }
    rows.push([]);
    rows.push(['Hold Summary', 'IRR', fmtPercent(report.proForma.irr)]);
    rows.push(['Hold Summary', 'NPV', fmtCurrency(report.proForma.npv, true)]);
    rows.push(['Hold Summary', 'Equity Multiple', fmtMultiplier(report.proForma.equityMultiple)]);
    rows.push(['Hold Summary', 'Net Sale Proceeds', fmtCurrency(report.proForma.netSaleProceeds, true)]);
    rows.push(['Hold Summary', 'Total Profit', fmtCurrency(report.proForma.totalProfit, true)]);
  }

  return rows;
}

/** Full CSV string for a report. */
export function reportToCsv(report: DealReport): string {
  return rowsToCsv(reportToCsvRows(report));
}
