/**
 * RPE-77: canonical report + CSV serialization — Node, no DOM.
 */

import { describe, it, expect } from 'vitest';
import { EXAMPLE_DEAL_INPUTS, evaluate } from '@rpe/engine';
import type { ScreenerResults } from '@rpe/engine';
import {
  buildCsvRows,
  buildReport,
  escapeCsvCell,
  reportToCsv,
  reportToCsvRows,
  rowsToCsv,
} from '../src/index';

const GENERATED_AT = '2026-06-09T00:00:00.000Z';

describe('buildReport (screener)', () => {
  const report = buildReport(EXAMPLE_DEAL_INPUTS, {
    generatedAt: GENERATED_AT,
    engineVersion: '1.5.0',
  });

  it('carries documented metadata', () => {
    expect(report.meta).toEqual({
      reportVersion: 1,
      generatedAt: GENERATED_AT,
      engineVersion: '1.5.0',
      mode: 'screener',
    });
    expect(report.inputs).toEqual(EXAMPLE_DEAL_INPUTS);
    expect(report.proForma).toBeNull();
  });

  it('annotates every metric with config + signal and formats like the UI', () => {
    const capRate = report.metrics.find((m) => m.key === 'capRate');
    // Golden Example deal: cap rate 4.4% against a 5% threshold → fail
    expect(capRate).toMatchObject({
      group: 'Returns',
      direction: 'higher',
      threshold: 5,
      signal: 'fail',
      formatted: '4.40%',
    });
    const ltv = report.metrics.find((m) => m.key === 'ltv');
    expect(ltv).toMatchObject({ signal: 'pass' }); // 80 ≤ 80

    const info = report.metrics.find((m) => m.key === 'loanAmount');
    expect(info?.signal).toBe('info');

    // Informational metric with no value: stays 'info', renders the null dash
    const nullMetric = report.metrics.find((m) => m.key === 'pricePerSqft');
    expect(nullMetric).toMatchObject({ value: null, formatted: '—', signal: 'info' });
  });

  it('score counts only pass/fail signals and matches the ScoreCard semantics', () => {
    const scored = report.metrics.filter((m) => m.signal === 'pass' || m.signal === 'fail');
    expect(report.score.total).toBe(scored.length);
    expect(report.score.passing).toBe(scored.filter((m) => m.signal === 'pass').length);
    expect(report.score.pct).toBeCloseTo((report.score.passing / report.score.total) * 100, 10);
  });
});

describe('buildReport (pro-forma)', () => {
  const report = buildReport(
    { ...EXAMPLE_DEAL_INPUTS, holdYears: 5, rentGrowthPct: 3, expenseGrowthPct: 2, appreciationPct: 4, sellingCostsPct: 6 },
    { mode: 'proforma', generatedAt: GENERATED_AT },
  );

  it('embeds the projection and hold summary', () => {
    expect(report.meta.mode).toBe('proforma');
    expect(report.proForma).not.toBeNull();
    expect(report.proForma?.projection).toHaveLength(5);
    expect(typeof report.proForma?.irr).toBe('number');
    expect(report.proForma?.salePrice).toBeGreaterThan(0);
  });

  it('serializes pro-forma rows into the CSV', () => {
    const csv = reportToCsv(report);
    expect(csv).toContain('Pro-Forma,Year,Cash Flow');
    expect(csv).toContain('Hold Summary,IRR');
    expect(csv.split('\r\n').filter((l) => l.startsWith('Pro-Forma,')).length).toBe(6); // header + 5 years
  });
});

describe('CSV parity with the UI export (golden)', () => {
  it('matches the historical serialization for the Example deal', () => {
    const results = evaluate(EXAMPLE_DEAL_INPUTS) as ScreenerResults;
    const rows = buildCsvRows([{ name: 'Scenario 1' }], [results]);
    const csv = rowsToCsv(rows);

    // Golden lines — locked to the exact pre-refactor UI output style
    expect(rows[0]).toEqual(['Group', 'Metric', 'Scenario 1']);
    expect(csv).toContain('Returns,Cap Rate,4.40%');
    expect(csv).toContain('Returns,Cash Flow / mo,-$496.73'); // no comma → unquoted per RFC 4180
    expect(csv).toContain('Loan,Loan Amount,"$240,000"');
    expect(csv).toContain('Capital,Total Cash Invested,"$66,000"');
    // null-only rows are omitted (no units/sqft set on the Example deal)
    expect(csv).not.toContain('Price / Unit');
  });

  it('escapes per RFC 4180', () => {
    expect(escapeCsvCell('plain')).toBe('plain');
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('runs without any DOM globals', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
    expect(reportToCsvRows(buildReport(EXAMPLE_DEAL_INPUTS)).length).toBeGreaterThan(10);
  });
});
