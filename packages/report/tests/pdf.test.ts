/**
 * RPE-78: PDF pipeline — valid output, documented sections, determinism.
 */

import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { EXAMPLE_DEAL_INPUTS } from '@rpe/engine';
import { buildReport, reportToPdf } from '../src/index';

const GENERATED_AT = '2026-06-09T00:00:00.000Z';

const screenerReport = () =>
  buildReport(EXAMPLE_DEAL_INPUTS, { generatedAt: GENERATED_AT, engineVersion: '1.5.0' });

const proFormaReport = () =>
  buildReport(
    { ...EXAMPLE_DEAL_INPUTS, holdYears: 12, rentGrowthPct: 3, expenseGrowthPct: 2, appreciationPct: 4, sellingCostsPct: 6 },
    { mode: 'proforma', generatedAt: GENERATED_AT, engineVersion: '1.5.0' },
  );

describe('reportToPdf', () => {
  it('produces a valid, loadable PDF for a screener report', async () => {
    const bytes = await reportToPdf(screenerReport());
    expect(bytes.length).toBeGreaterThan(2_000);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');

    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(reloaded.getTitle()).toBe('Rental Property Evaluation Report');
  });

  it('renders pro-forma sections and paginates long projections', async () => {
    const bytes = await reportToPdf(proFormaReport());
    const reloaded = await PDFDocument.load(bytes);
    // 26 metric rows + 12 projection years + summaries spill past one A4 page
    expect(reloaded.getPageCount()).toBeGreaterThanOrEqual(2);
  });

  it('is byte-deterministic for a fixed generatedAt', async () => {
    const a = await reportToPdf(screenerReport());
    const b = await reportToPdf(screenerReport());
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('pins document dates to meta.generatedAt', async () => {
    // load() defaults to updateMetadata:true, which stamps ModificationDate
    // on the LOADED doc — disable it so we read what's actually in the bytes
    const reloaded = await PDFDocument.load(await reportToPdf(screenerReport()), {
      updateMetadata: false,
    });
    expect(reloaded.getCreationDate()?.toISOString()).toBe(GENERATED_AT);
    expect(reloaded.getModificationDate()?.toISOString()).toBe(GENERATED_AT);
  });
});
