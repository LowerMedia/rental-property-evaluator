import { describe, it, expect } from 'vitest';
import { escapeCsvCell, rowsToCsv, buildCsvRows } from '../src/utils/exportCsv';
import { evaluate } from '@rpe/engine';
import type { ScreenerResults } from '@rpe/engine';
import { DEFAULT_INPUTS } from '../src/state/defaultInputs';
import type { Scenario } from '../src/state/scenarios';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeScenario(name: string): Pick<Scenario, 'name'> {
  return { name };
}

function evalResults(): ScreenerResults {
  return evaluate(DEFAULT_INPUTS) as ScreenerResults;
}

// ─── escapeCsvCell ────────────────────────────────────────────────────────────

describe('escapeCsvCell', () => {
  it('returns plain text unchanged', () => {
    expect(escapeCsvCell('hello')).toBe('hello');
  });

  it('wraps a value containing a comma in double-quotes', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
  });

  it('wraps a value containing a double-quote and doubles the quote', () => {
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('wraps a value containing a newline', () => {
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('wraps a value containing a carriage return', () => {
    expect(escapeCsvCell('a\rb')).toBe('"a\rb"');
  });

  it('does not wrap simple numeric strings', () => {
    expect(escapeCsvCell('1234')).toBe('1234');
  });
});

// ─── rowsToCsv ────────────────────────────────────────────────────────────────

describe('rowsToCsv', () => {
  it('joins a single row with commas', () => {
    expect(rowsToCsv([['a', 'b', 'c']])).toBe('a,b,c');
  });

  it('separates rows with CRLF', () => {
    expect(rowsToCsv([['a', 'b'], ['c', 'd']])).toBe('a,b\r\nc,d');
  });

  it('escapes cells containing commas', () => {
    expect(rowsToCsv([['hello,world', 'ok']])).toBe('"hello,world",ok');
  });
});

// ─── buildCsvRows ─────────────────────────────────────────────────────────────

describe('buildCsvRows', () => {
  const scenarios = [makeScenario('Scenario A')];
  const results = [evalResults()];

  it('first row is the header', () => {
    const rows = buildCsvRows(scenarios, results);
    expect(rows[0]).toEqual(['Group', 'Metric', 'Scenario A']);
  });

  it('returns more than just the header row', () => {
    const rows = buildCsvRows(scenarios, results);
    expect(rows.length).toBeGreaterThan(1);
  });

  it('every data row has the same column count as the header', () => {
    const rows = buildCsvRows(scenarios, results);
    const colCount = rows[0]!.length;
    for (const row of rows.slice(1)) {
      expect(row.length).toBe(colCount);
    }
  });

  it('first column contains known group names', () => {
    const rows = buildCsvRows(scenarios, results);
    const groups = new Set(rows.slice(1).map((r) => r[0]));
    expect(groups.has('Returns')).toBe(true);
    expect(groups.has('Loan')).toBe(true);
    expect(groups.has('Capital')).toBe(true);
  });

  it('second column contains metric labels (not keys)', () => {
    const rows = buildCsvRows(scenarios, results);
    const labels = rows.slice(1).map((r) => r[1]);
    // Labels should be human-readable, not camelCase keys
    expect(labels.some((l) => l === 'Cap Rate')).toBe(true);
    expect(labels.some((l) => l === 'DSCR')).toBe(true);
  });

  it('omits rows where all scenario values are null (e.g. pricePerUnit when units not set)', () => {
    // DEFAULT_INPUTS has no units / sqft → pricePerUnit and pricePerSqft are null
    const rows = buildCsvRows(scenarios, results);
    const labels = rows.map((r) => r[1]);
    expect(labels).not.toContain('Price / Unit');
    expect(labels).not.toContain('Price / Sqft');
  });

  it('includes pricePerUnit when units are provided', () => {
    const inputsWithUnits = { ...DEFAULT_INPUTS, units: 4 };
    const multiResults = [evaluate(inputsWithUnits) as ScreenerResults];
    const rows = buildCsvRows(scenarios, multiResults);
    const labels = rows.map((r) => r[1]);
    expect(labels).toContain('Price / Unit');
  });

  it('handles multiple scenarios with a column per scenario', () => {
    const twoScenarios = [makeScenario('Base'), makeScenario('Optimistic')];
    const twoResults = [evalResults(), evalResults()];
    const rows = buildCsvRows(twoScenarios, twoResults);
    expect(rows[0]).toEqual(['Group', 'Metric', 'Base', 'Optimistic']);
    // Each data row should have 4 columns
    for (const row of rows.slice(1)) {
      expect(row.length).toBe(4);
    }
  });

  it('dscr appears only once (no duplicate rows)', () => {
    const rows = buildCsvRows(scenarios, results);
    const dscrRows = rows.filter((r) => r[1] === 'DSCR');
    expect(dscrRows.length).toBe(1);
  });
});
