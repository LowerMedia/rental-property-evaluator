import type { Dispatch } from 'react';
import type { DealInputs, ExpenseInput } from '@rpe/engine';
import type { DealAction } from '../../state/dealReducer';
import type { UiMode } from '../../state/uiMode';
import { InputSection } from './InputSection';
import { CurrencyInput } from './CurrencyInput';
import { PercentInput } from './PercentInput';
import { NumberInput } from './NumberInput';
import { ToggleInput } from './ToggleInput';
import { FixedExpenseRow } from './FixedExpenseRow';
import { AutofillBar } from '../AutofillBar';

export interface DealInputsFormProps {
  state: DealInputs;
  dispatch: Dispatch<DealAction>;
  /** When true, the Pro-Forma Settings section is rendered (complex mode only). */
  proFormaMode?: boolean;
  /**
   * Controls which input sections are shown.
   * - 'simple'  — shows only Purchase Price, Down Payment, Gross Rent, and Vacancy.
   *               All other input sections are hidden. Complex-tier fields (financing,
   *               acquisition costs, expenses) are supplied by national-average baseline
   *               assumptions. Optional metadata (units, sqft) and pro-forma fields are
   *               hidden and not evaluated in simple mode — they are not baselined.
   * - 'complex' — shows all sections (default, current behaviour).
   */
  uiMode?: UiMode;
  /** RentCast API key from connectorStorage. Passed to AutofillBar (wired in RPE-43d). */
  apiKey?: string | null;
}

/**
 * Deal-input form, grouped into labelled sections.
 * Each input dispatches a typed action to the parent reducer.
 *
 * In simple mode only the four core fields are shown; complex-tier sections
 * are replaced by a brief note describing the active baseline assumptions.
 * User values entered in complex mode are preserved in state and restored on
 * return to complex mode — no data is discarded on mode switch.
 */
export function DealInputsForm({
  state,
  dispatch,
  proFormaMode = false,
  uiMode = 'complex',
  apiKey = null,
}: DealInputsFormProps) {
  const { expenses } = state;
  const simple = uiMode === 'simple';

  // Fixed-expense refs (only used in complex mode, declared here to avoid
  // repeated optional-chaining and keep JSX clean).
  const taxes = expenses.taxes as ExpenseInput;
  const insurance = expenses.insurance as ExpenseInput;
  const hoa = expenses.hoa ?? { amount: 0, period: 'monthly' as const };

  return (
    <div>
      {/* ── Autofill bar (always shown, adapts when apiKey is null) ──────── */}
      <AutofillBar dispatch={dispatch} apiKey={apiKey} />

      {/* ── Acquisition ──────────────────────────────────────────────────── */}
      <InputSection title="Acquisition">
        <CurrencyInput
          label="Purchase Price"
          value={state.purchasePrice}
          onChange={(v) => dispatch({ type: 'SET_NUMBER', field: 'purchasePrice', value: v })}
        />
        <PercentInput
          label="Down Payment"
          value={state.percentDown}
          onChange={(v) => dispatch({ type: 'SET_NUMBER', field: 'percentDown', value: v })}
          min={0}
          max={100}
          hint="100 = cash purchase (no loan)"
        />
        {!simple && (
          <>
            <CurrencyInput
              label="Closing Costs"
              value={state.closingCosts}
              onChange={(v) => dispatch({ type: 'SET_NUMBER', field: 'closingCosts', value: v })}
              emptyZero
            />
            <ToggleInput
              label="Roll Closing Costs Into Loan"
              value={state.rollClosingCostsIntoLoan}
              onChange={(v) =>
                dispatch({ type: 'SET_BOOL', field: 'rollClosingCostsIntoLoan', value: v })
              }
            />
            <CurrencyInput
              label="Rehab Budget"
              value={state.rehab ?? 0}
              onChange={(v) => dispatch({ type: 'SET_NUMBER', field: 'rehab', value: v })}
              emptyZero
              hint="Added to total cash invested; not financed"
            />
          </>
        )}
      </InputSection>

      {/* ── Financing (complex mode only) ────────────────────────────────── */}
      {!simple && (
        <InputSection title="Financing">
          <PercentInput
            label="Interest Rate"
            value={state.interestRate}
            onChange={(v) => dispatch({ type: 'SET_NUMBER', field: 'interestRate', value: v })}
            min={0}
            max={30}
            hint="Annual rate — set to 0 for interest-free"
          />
          <NumberInput
            label="Loan Term"
            value={state.loanTermYears}
            onChange={(v) => dispatch({ type: 'SET_NUMBER', field: 'loanTermYears', value: v })}
            min={1}
            max={50}
            unit="yrs"
          />
        </InputSection>
      )}

      {/* ── Income ───────────────────────────────────────────────────────── */}
      <InputSection title="Income">
        <CurrencyInput
          label="Gross Rent"
          value={state.grossRent}
          onChange={(v) => dispatch({ type: 'SET_NUMBER', field: 'grossRent', value: v })}
          hint="Monthly gross potential rent"
        />
        {!simple && (
          <CurrencyInput
            label="Other Income"
            value={state.otherIncome ?? 0}
            onChange={(v) => dispatch({ type: 'SET_NUMBER', field: 'otherIncome', value: v })}
            emptyZero
            hint="Parking, laundry, storage, pet rent, etc."
          />
        )}
        <PercentInput
          label="Vacancy"
          value={state.vacancyPct}
          onChange={(v) => dispatch({ type: 'SET_NUMBER', field: 'vacancyPct', value: v })}
          min={0}
          max={100}
          hint={simple ? 'Applied to gross rent' : 'Applied to gross rent + other income'}
        />
      </InputSection>

      {/* ── Simple-mode assumptions note ─────────────────────────────────── */}
      {simple && (
        <div className="px-4 py-3 border-b border-border last:border-b-0 text-xs text-lo italic">
          Financing, acquisition costs, and expenses use national-average assumptions.
          Switch to Complex mode to customise.
        </div>
      )}

      {/* ── Fixed Expenses (complex mode only) ───────────────────────────── */}
      {!simple && (
        <InputSection title="Fixed Expenses">
          <FixedExpenseRow
            label="Property Taxes"
            amount={taxes.amount}
            period={taxes.period}
            onAmountChange={(amount) =>
              dispatch({ type: 'SET_EXPENSE_FIXED', field: 'taxes', amount, period: taxes.period })
            }
            onPeriodChange={(period) =>
              dispatch({ type: 'SET_EXPENSE_FIXED', field: 'taxes', amount: taxes.amount, period })
            }
          />
          <FixedExpenseRow
            label="Insurance"
            amount={insurance.amount}
            period={insurance.period}
            onAmountChange={(amount) =>
              dispatch({
                type: 'SET_EXPENSE_FIXED',
                field: 'insurance',
                amount,
                period: insurance.period,
              })
            }
            onPeriodChange={(period) =>
              dispatch({
                type: 'SET_EXPENSE_FIXED',
                field: 'insurance',
                amount: insurance.amount,
                period,
              })
            }
          />
          <FixedExpenseRow
            label="HOA"
            amount={hoa.amount}
            period={hoa.period}
            onAmountChange={(amount) =>
              dispatch({ type: 'SET_EXPENSE_FIXED', field: 'hoa', amount, period: hoa.period })
            }
            onPeriodChange={(period) =>
              dispatch({ type: 'SET_EXPENSE_FIXED', field: 'hoa', amount: hoa.amount, period })
            }
          />
        </InputSection>
      )}

      {/* ── Variable Expenses (complex mode only) ────────────────────────── */}
      {!simple && (
        <InputSection title="Variable Expenses">
          <PercentInput
            label="CapEx Reserve"
            value={expenses.capExPct ?? 0}
            onChange={(v) => dispatch({ type: 'SET_EXPENSE_PCT', field: 'capExPct', value: v })}
            min={0}
            max={50}
            hint="% of gross rent set aside for capital expenses"
          />
          <PercentInput
            label="Maintenance"
            value={expenses.maintPct ?? 0}
            onChange={(v) => dispatch({ type: 'SET_EXPENSE_PCT', field: 'maintPct', value: v })}
            min={0}
            max={50}
          />
          <PercentInput
            label="Property Management"
            value={expenses.mgmtPct ?? 0}
            onChange={(v) => dispatch({ type: 'SET_EXPENSE_PCT', field: 'mgmtPct', value: v })}
            min={0}
            max={50}
          />
          <PercentInput
            label="Miscellaneous"
            value={expenses.miscPct ?? 0}
            onChange={(v) => dispatch({ type: 'SET_EXPENSE_PCT', field: 'miscPct', value: v })}
            min={0}
            max={50}
          />
          <ToggleInput
            label="Include CapEx in NOI"
            value={state.capExInNOI ?? true}
            onChange={(v) => dispatch({ type: 'SET_BOOL', field: 'capExInNOI', value: v })}
            hint="Conservative (on) vs. lender convention (off)"
          />
        </InputSection>
      )}

      {/* ── Property Details (complex mode only) ─────────────────────────── */}
      {!simple && (
        <InputSection title="Property Details">
          <NumberInput
            label="Units"
            value={state.units ?? 0}
            onChange={(v) =>
              dispatch({ type: 'SET_NUMBER', field: 'units', value: v === 0 ? 0 : v })
            }
            min={0}
            unit="units"
            hint="Leave 0 to hide price-per-unit metric"
          />
          <NumberInput
            label="Square Footage"
            value={state.sqft ?? 0}
            onChange={(v) => dispatch({ type: 'SET_NUMBER', field: 'sqft', value: v })}
            min={0}
            unit="sqft"
            hint="Leave 0 to hide price-per-sqft metric"
          />
        </InputSection>
      )}

      {/* ── Pro-Forma Settings (complex + pro-forma mode only) ───────────── */}
      {!simple && proFormaMode && (
        <InputSection title="Pro-Forma Settings">
          <NumberInput
            label="Hold Period"
            value={state.holdYears ?? 5}
            onChange={(v) => dispatch({ type: 'SET_NUMBER', field: 'holdYears', value: v })}
            min={1}
            max={50}
            unit="yrs"
            hint="Number of years to project"
          />
          <PercentInput
            label="Rent Growth"
            value={state.rentGrowthPct ?? 2}
            onChange={(v) => dispatch({ type: 'SET_NUMBER', field: 'rentGrowthPct', value: v })}
            min={-20}
            max={20}
            hint="Annual rent growth rate"
          />
          <PercentInput
            label="Expense Growth"
            value={state.expenseGrowthPct ?? 2}
            onChange={(v) =>
              dispatch({ type: 'SET_NUMBER', field: 'expenseGrowthPct', value: v })
            }
            min={-20}
            max={20}
            hint="Annual growth for fixed expenses"
          />
          <PercentInput
            label="Appreciation"
            value={state.appreciationPct ?? 3}
            onChange={(v) => dispatch({ type: 'SET_NUMBER', field: 'appreciationPct', value: v })}
            min={-20}
            max={20}
            hint="Annual property value growth"
          />
          <PercentInput
            label="Selling Costs"
            value={state.sellingCostsPct ?? 6}
            onChange={(v) =>
              dispatch({ type: 'SET_NUMBER', field: 'sellingCostsPct', value: v })
            }
            min={0}
            max={20}
            hint="Agent commission + closing costs at sale"
          />
          <CurrencyInput
            label="Land Value"
            value={state.landValue ?? 0}
            onChange={(v) => dispatch({ type: 'SET_NUMBER', field: 'landValue', value: v })}
            emptyZero
            hint="Non-depreciable portion of purchase price"
          />
          <PercentInput
            label="Marginal Tax Rate"
            value={state.marginalTaxPct ?? 0}
            onChange={(v) => dispatch({ type: 'SET_NUMBER', field: 'marginalTaxPct', value: v })}
            min={0}
            max={60}
            hint="For after-tax cash flow (leave 0 to skip)"
          />
          <PercentInput
            label="Discount Rate (NPV)"
            value={state.discountRatePct ?? 0}
            onChange={(v) =>
              dispatch({ type: 'SET_NUMBER', field: 'discountRatePct', value: v })
            }
            min={0}
            max={50}
            hint="Hurdle rate — leave 0 to skip NPV"
          />
        </InputSection>
      )}
    </div>
  );
}
