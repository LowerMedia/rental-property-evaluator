/**
 * CSV export — browser download wrapper (RPE-77).
 *
 * Serialization lives in @rpe/report (server-callable, single source of
 * truth); this module keeps only the DOM-bound download trigger and the
 * convenience wrapper the toolbar calls.
 */

import { buildCsvRows, escapeCsvCell, rowsToCsv } from '@rpe/report';
import type { ScreenerResults } from '@rpe/engine';
import type { Scenario } from '../state/scenarios';

// Re-exported so existing imports (tests, components) keep working
export { buildCsvRows, escapeCsvCell, rowsToCsv };

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
