import { SCREENER_METRIC_CONFIG } from '@rpe/engine';
import type { ScreenerResults } from '@rpe/engine';
import type { Scenario } from '../state/scenarios';
import { fmtCurrency, fmtPercent, fmtNumber, fmtMultiplier, NULL_DISPLAY } from './format';

// ─── Types ────────────────────────────────────────────────────────────────────

type MetricKey = keyof ScreenerResults;

// ─── CSV sections (mirrors ResultsPanel layout) ───────────────────────────────

interface CsvRow {
  group: string;
  key: MetricKey;
  /** Optional label override (e.g. "Cash Flow / mo"). */
  label?: string;
}

/**
 * Ordered list of metrics to include in the export.
 * Mirrors the ResultsPanel grouping; dscr de-duplicated (appears once, in Deal Quality).
 */
const CSV_ROWS: CsvRow[] = [
  // Returns
  { group: 'Returns', key: 'capRate' },
  { group: 'Returns', key: 'cocRoi' },
  { group: 'Returns', key: 'cashFlowMonthly', label: 'Cash Flow / mo' },
  { group: 'Returns', key: 'cashFlowAnnual', label: 'Cash Flow / yr' },

  // Deal Quality
  { group: 'Deal Quality', key: 'dscr' },
  { group: 'Deal Quality', key: 'onePercentRule', label: '1% Rule' },
  { group: 'Deal Quality', key: 'grm' },
  { group: 'Deal Quality', key: 'grossYield' },
  { group: 'Deal Quality', key: 'breakEvenOccupancy' },
  { group: 'Deal Quality', key: 'expenseRatio' },
  { group: 'Deal Quality', key: 'fiftyPctRuleDeviation', label: '50% Rule Dev.' },

  // Income & Expenses
  { group: 'Income & Expenses', key: 'egi', label: 'EGI / mo' },
  { group: 'Income & Expenses', key: 'egiAnnual', label: 'EGI / yr' },
  { group: 'Income & Expenses', key: 'noiMonthly', label: 'NOI / mo' },
  { group: 'Income & Expenses', key: 'noiAnnual', label: 'NOI / yr' },
  { group: 'Income & Expenses', key: 'opExMonthly', label: 'OpEx / mo' },
  { group: 'Income & Expenses', key: 'opExAnnual', label: 'OpEx / yr' },
  { group: 'Income & Expenses', key: 'piti', label: 'PITI / mo' },

  // Loan
  { group: 'Loan', key: 'loanAmount' },
  { group: 'Loan', key: 'mortgagePayment', label: 'P&I / mo' },
  { group: 'Loan', key: 'ltv' },
  { group: 'Loan', key: 'debtYield' },
  { group: 'Loan', key: 'totalInterest' },

  // Capital
  { group: 'Capital', key: 'totalCashInvested', label: 'Total Cash Invested' },
  { group: 'Capital', key: 'pricePerUnit' },
  { group: 'Capital', key: 'pricePerSqft' },
];

// ─── Formatting ───────────────────────────────────────────────────────────────

function fmtMetricRaw(key: MetricKey, value: number | null): string {
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

// ─── CSV helpers ──────────────────────────────────────────────────────────────

/**
 * Escape a single CSV cell value.
 * Wraps in double-quotes if the value contains a comma, quote, or newline.
 * Internal double-quotes are doubled per RFC 4180.
 */
export function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Convert a 2-D array of strings to a CRLF-delimited CSV string. */
export function rowsToCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a 2-D array of strings representing the CSV content.
 * Row 0 is the header: `[Group, Metric, ...scenarioNames]`.
 * Rows with all-null values across every scenario are omitted.
 */
export function buildCsvRows(
  scenarios: Pick<Scenario, 'name'>[],
  resultsList: ScreenerResults[],
): string[][] {
  const header = ['Group', 'Metric', ...scenarios.map((s) => s.name)];

  const dataRows = CSV_ROWS.flatMap((row) => {
    const values = resultsList.map((r) => r[row.key]);
    // Skip rows where every scenario returned null
    if (values.every((v) => v === null)) return [];

    const label = row.label ?? SCREENER_METRIC_CONFIG[row.key].label;
    const cells = values.map((v) => fmtMetricRaw(row.key, v));
    return [[row.group, label, ...cells]];
  });

  return [header, ...dataRows];
}

/**
 * Trigger a browser file download for the given CSV string.
 */
export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Generate an ISO date string (YYYY-MM-DD) for use in filenames. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Build the CSV content and trigger a download.
 * Filename: `rpe-YYYY-MM-DD.csv`.
 */
export function exportToCsv(
  scenarios: Pick<Scenario, 'name'>[],
  resultsList: ScreenerResults[],
): void {
  const rows = buildCsvRows(scenarios, resultsList);
  const content = rowsToCsv(rows);
  downloadCsv(content, `rpe-${todayIso()}.csv`);
}
