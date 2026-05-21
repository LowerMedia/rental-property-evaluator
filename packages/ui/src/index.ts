// @rpe/ui — shared React 18 components, hooks, and utilities
// RPE-E2 (SPA screener UI)

// ── Entry component ──────────────────────────────────────────────────────────
export { Evaluator } from './Evaluator';

// ── State ────────────────────────────────────────────────────────────────────
export { dealReducer } from './state/dealReducer';
export { DEFAULT_INPUTS } from './state/defaultInputs';
export type { DealAction } from './state/dealReducer';

// ── Hooks ────────────────────────────────────────────────────────────────────
export { useEvaluate } from './hooks/useEvaluate';

// ── Utilities ────────────────────────────────────────────────────────────────
export {
  fmtCurrency,
  fmtPercent,
  fmtNumber,
  fmtMultiplier,
  fmtInputValue,
  parseInputValue,
  NULL_DISPLAY,
} from './utils/format';

// ── Input components ─────────────────────────────────────────────────────────
export { CurrencyInput } from './components/inputs/CurrencyInput';
export { PercentInput } from './components/inputs/PercentInput';
export { NumberInput } from './components/inputs/NumberInput';
export { ToggleInput } from './components/inputs/ToggleInput';
export { PeriodSelect } from './components/inputs/PeriodSelect';
export { FixedExpenseRow } from './components/inputs/FixedExpenseRow';
export { InputSection } from './components/inputs/InputSection';
export { DealInputsForm } from './components/inputs/DealInputsForm';
