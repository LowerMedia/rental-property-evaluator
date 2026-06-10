// @rpe/ui — shared React 18 components, hooks, and utilities
// RPE-E2 (SPA screener UI)

// ── Entry component ──────────────────────────────────────────────────────────
export { Evaluator } from './Evaluator';
export type { AdConfig } from './Evaluator';

// ── State ────────────────────────────────────────────────────────────────────
export { dealReducer } from './state/dealReducer';
export {
  createScenario,
  addScenario,
  removeScenario,
  renameScenario,
  applyDealAction,
  replaceInputs,
  MIN_SCENARIOS,
  MAX_SCENARIOS,
} from './state/scenarios';
export type { Scenario } from './state/scenarios';
export { DEFAULT_INPUTS } from './state/defaultInputs';
export type { DealAction } from './state/dealReducer';
export {
  loadStore,
  persistStore,
  migrateStore,
  createEmptyStore,
  STORAGE_KEY,
  SCHEMA_VERSION,
} from './state/savedDealsSchema';
export type { SavedDeal, SavedDealsStore } from './state/savedDealsSchema';

// ── Hooks ────────────────────────────────────────────────────────────────────
export { useEvaluate } from './hooks/useEvaluate';
export { useSavedDeals } from './hooks/useSavedDeals';
export type { UseSavedDealsReturn } from './hooks/useSavedDeals';
export { useScenarios } from './hooks/useScenarios';
export type { UseScenariosReturn } from './hooks/useScenarios';

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

export {
  encodeInputs,
  decodeInputs,
  parseShareParam,
  buildShareUrl,
  SHARE_PARAM,
} from './utils/shareUrl';

export {
  escapeCsvCell,
  rowsToCsv,
  buildCsvRows,
  downloadCsv,
  exportToCsv,
} from './utils/exportCsv';

// ── Input components ─────────────────────────────────────────────────────────
export { CurrencyInput } from './components/inputs/CurrencyInput';
export { PercentInput } from './components/inputs/PercentInput';
export { NumberInput } from './components/inputs/NumberInput';
export { ToggleInput } from './components/inputs/ToggleInput';
export { PeriodSelect } from './components/inputs/PeriodSelect';
export { FixedExpenseRow } from './components/inputs/FixedExpenseRow';
export { InputSection } from './components/inputs/InputSection';
export { DealInputsForm } from './components/inputs/DealInputsForm';
export { AuthProvider, useAuth } from './state/AuthContext';
export { AuthClient, getStoredOrgId, storeOrgId } from './state/authClient';
export type { AuthUser, AuthOrg } from './state/authClient';
export { AuthScreen, LoginForm, RegisterForm, ForgotForm, ResetForm } from './components/auth/AuthScreen';
export { AccountMenu } from './components/auth/AccountMenu';
export { OrgSwitcher } from './components/auth/OrgSwitcher';
export { parseAuthHash } from './state/authRoutes';
