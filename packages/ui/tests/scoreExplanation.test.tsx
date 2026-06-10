/**
 * RPE-70: score explanation disclosure — config-driven, accessible,
 * pass/fail matches the score numerator.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { evaluate, EXAMPLE_DEAL_INPUTS, SCREENER_METRIC_CONFIG } from '@rpe/engine';
import type { ScreenerResults } from '@rpe/engine';
import { Evaluator } from '../src/Evaluator';

const SCORED_COUNT = Object.values(SCREENER_METRIC_CONFIG).filter(
  (cfg) => cfg.direction !== 'none',
).length;

describe('ScoreCard explanation disclosure (RPE-70)', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  function openDisclosure() {
    render(<Evaluator />);
    const toggle = screen.getAllByRole('button', { name: /How is this scored/ })[0];
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    return toggle;
  }

  it('is collapsed by default and toggles with aria-expanded', () => {
    const toggle = openDisclosure();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('renders every scored metric from config — no hardcoded list', () => {
    openDisclosure();
    const panel = document.getElementById('score-explanation')!;
    const rows = panel.querySelectorAll('.grid');
    expect(rows.length).toBe(SCORED_COUNT);
    // Spot-check labels and thresholds come from config
    for (const cfg of Object.values(SCREENER_METRIC_CONFIG)) {
      if (cfg.direction === 'none') continue;
      expect(panel.textContent).toContain(cfg.label);
    }
    expect(panel.textContent).toContain('≥');
    expect(panel.textContent).toContain('≤');
  });

  it('per-metric pass/fail matches the score numerator', () => {
    openDisclosure();
    const panel = document.getElementById('score-explanation')!;
    const passCount = [...panel.querySelectorAll('.grid')].filter((row) =>
      row.textContent?.endsWith('pass'),
    ).length;

    // The default form IS the example deal inputs minus closing costs —
    // compute the numerator the same way the card does
    const results = evaluate(EXAMPLE_DEAL_INPUTS) as ScreenerResults;
    void results; // numerator asserted against the on-screen score instead:
    const scoreText = document.querySelector('.num.text-lg')?.textContent ?? '';
    const numerator = Number(scoreText.match(/^(\d+)/)?.[1]);
    expect(passCount).toBe(numerator);
  });

  it('explains the color bands and the informational-metric exclusion', () => {
    openDisclosure();
    const panel = document.getElementById('score-explanation')!;
    expect(panel.textContent).toContain('75%');
    expect(panel.textContent).toContain('50%');
    expect(panel.textContent).toContain('Informational');
  });

  it('is excluded from print via no-print', () => {
    const toggle = openDisclosure();
    expect(toggle.className).toContain('no-print');
    expect(document.getElementById('score-explanation')?.className).toContain('no-print');
  });
});
