/**
 * RPE-54: review-panel selection defaults — regression for the
 * defaults-vs-edits bug caught in the RPE-53 browser walkthrough.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { DealInputPatch, DealPatchTarget } from '@rpe/property';
import { AutofillPreviewPopover } from '../src/components/AutofillPreviewPopover';
import { DEFAULT_INPUTS } from '../src/state/defaultInputs';

function patch(
  target: DealPatchTarget,
  amount: number,
  confidence: DealInputPatch['confidence'] = 'medium',
): DealInputPatch {
  const isExpense = target.startsWith('expenses.');
  return {
    target,
    value: isExpense ? { kind: 'expense', amount, period: 'annual' } : { kind: 'number', amount },
    source: 'rentcast',
    confidence,
    needsReview: confidence === 'low',
  };
}

const checkbox = (label: string) => screen.getByLabelText(`Apply ${label}`) as HTMLInputElement;

describe('AutofillPreviewPopover selection defaults', () => {
  // No vitest globals → RTL auto-cleanup doesn't run; clean up explicitly
  afterEach(cleanup);

  it('pre-checks medium/high rows over UNTOUCHED form defaults', () => {
    render(
      <AutofillPreviewPopover
        patches={[patch('purchasePrice', 342_000), patch('expenses.taxes', 4_210, 'high')]}
        meta={{}}
        onApply={vi.fn()}
        onDismiss={vi.fn()}
        currentValues={{
          purchasePrice: DEFAULT_INPUTS.purchasePrice, // default, not an edit
          annualTaxes: DEFAULT_INPUTS.expenses.taxes.amount,
        }}
      />,
    );

    expect(checkbox('Purchase Price').checked).toBe(true);
    expect(checkbox('Property Taxes (yr)').checked).toBe(true);
  });

  it('leaves rows over USER-EDITED values unchecked (explicit confirm)', () => {
    render(
      <AutofillPreviewPopover
        patches={[patch('purchasePrice', 342_000), patch('grossRent', 2_150)]}
        meta={{}}
        onApply={vi.fn()}
        onDismiss={vi.fn()}
        currentValues={{ purchasePrice: 415_000, grossRent: DEFAULT_INPUTS.grossRent }}
      />,
    );

    expect(checkbox('Purchase Price').checked).toBe(false); // user typed 415k
    expect(checkbox('Gross Rent (mo)').checked).toBe(true); // untouched default
  });

  it('leaves needs-review (low confidence) rows unchecked even over defaults', () => {
    render(
      <AutofillPreviewPopover
        patches={[patch('sqft', 1_480, 'low')]}
        meta={{}}
        onApply={vi.fn()}
        onDismiss={vi.fn()}
        currentValues={{ sqft: null }}
      />,
    );

    expect(checkbox('Square Footage').checked).toBe(false);
    expect(screen.getByText('needs review')).toBeTruthy();
  });

  it('applies exactly the checked set', () => {
    const onApply = vi.fn();
    render(
      <AutofillPreviewPopover
        patches={[patch('purchasePrice', 342_000), patch('grossRent', 2_150, 'low')]}
        meta={{}}
        onApply={onApply}
        onDismiss={vi.fn()}
        currentValues={{}}
      />,
    );

    // Opt the low-confidence rent IN, opt the price OUT
    fireEvent.click(checkbox('Gross Rent (mo)'));
    fireEvent.click(checkbox('Purchase Price'));
    fireEvent.click(screen.getByRole('button', { name: /Apply/ }));

    expect(onApply).toHaveBeenCalledTimes(1);
    const selected = onApply.mock.calls[0][0] as ReadonlySet<DealPatchTarget>;
    expect([...selected]).toEqual(['grossRent']);
  });

  it('shows source labels for non-rentcast tiers', () => {
    render(
      <AutofillPreviewPopover
        patches={[{ ...patch('purchasePrice', 280_000, 'low'), source: 'paste' }]}
        meta={{ yearBuilt: { value: 1987, source: 'paste', confidence: 'low' } }}
        onApply={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText('Pasted text')).toBeTruthy();
    expect(screen.getByText(/built 1987/)).toBeTruthy();
  });
});
