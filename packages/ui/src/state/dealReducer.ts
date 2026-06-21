import type { DealExpenses, DealInputs, ExpenseInput } from '@rpe/engine';
import { DEFAULT_INPUTS } from './defaultInputs';

// ─── Narrowed field key unions ─────────────────────────────────────────────────

/** All top-level DealInputs keys that hold a plain number (or undefined number). */
type NumericDealKey =
  | 'purchasePrice'
  | 'percentDown'
  | 'interestRate'
  | 'loanTermYears'
  | 'closingCosts'
  | 'rehab'
  | 'grossRent'
  | 'otherIncome'
  | 'vacancyPct'
  | 'units'
  | 'sqft'
  | 'landValue'
  | 'holdYears'
  | 'rentGrowthPct'
  | 'expenseGrowthPct'
  | 'appreciationPct'
  | 'sellingCostsPct'
  | 'marginalTaxPct'
  | 'discountRatePct';

/** All top-level DealInputs keys that hold a boolean (or undefined boolean). */
type BooleanDealKey = 'rollClosingCostsIntoLoan' | 'capExInNOI' | 'capRateAllIn';

// ─── Actions ─────────────────────────────────────────────────────────────────

export type DealAction =
  | { type: 'SET_NUMBER'; field: NumericDealKey; value: number }
  | { type: 'SET_BOOL'; field: BooleanDealKey; value: boolean }
  | { type: 'SET_EXPENSE_PCT'; field: 'capExPct' | 'maintPct' | 'mgmtPct' | 'miscPct'; value: number }
  | {
      type: 'SET_EXPENSE_FIXED';
      field: 'taxes' | 'insurance' | 'hoa' | 'other';
      amount: number;
      period: ExpenseInput['period'];
    }
  | { type: 'RESET' }
  | { type: 'LOAD'; inputs: DealInputs };

// ─── Reducer ─────────────────────────────────────────────────────────────────

export function dealReducer(state: DealInputs, action: DealAction): DealInputs {
  switch (action.type) {
    case 'SET_NUMBER':
      return { ...state, [action.field]: action.value };

    case 'SET_BOOL':
      return { ...state, [action.field]: action.value };

    case 'SET_EXPENSE_PCT':
      return {
        ...state,
        expenses: { ...state.expenses, [action.field]: action.value },
      };

    case 'SET_EXPENSE_FIXED': {
      const prev = state.expenses[action.field] as ExpenseInput | undefined;
      const updated: DealExpenses = {
        ...state.expenses,
        [action.field]: {
          amount: action.amount,
          period: action.period ?? prev?.period ?? 'annual',
        },
      };
      return { ...state, expenses: updated };
    }

    case 'RESET':
      return structuredClone(DEFAULT_INPUTS);

    case 'LOAD':
      return { ...action.inputs };

    default:
      return state;
  }
}
