/**
 * One-time migration: reads legacy `changeableRPE` localStorage data (v0.1.0 CRA 4 app)
 * and converts it to the `rpe.v1.scenarios` format used by v1.0.0.
 *
 * Run once at app boot, before any other storage access.
 * See docs/legacy-storage.md for the full legacy shape spec.
 *
 * NOTE: the DealInputs import below is wired once RPE-12 lands.
 * Until then the shape is documented inline for reference.
 */

const LEGACY_KEY = 'changeableRPE';
const V1_KEY = 'rpe.v1.scenarios';

interface LegacyChangeableRPE {
  PurchasePrice?: string;
  PercentDown?: string;
  InterestRate?: string;
  LoanTerm?: string;
  MonthlyRent?: string;
  Taxes?: string;
  Insurance?: string;
  HOA?: string;
  OtherExpense?: string;
  CapExPct?: string;
  MaintPct?: string;
  ManagementPct?: string;
  VacancyPct?: string;
}

function num(s: string | undefined, fallback = 0): number {
  const v = parseFloat(s ?? '');
  return isNaN(v) ? fallback : v;
}

export function runLegacyMigration(): void {
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return;

  // Already migrated — old key gone, v1 key present.
  if (localStorage.getItem(V1_KEY)) {
    localStorage.removeItem(LEGACY_KEY);
    return;
  }

  let legacy: LegacyChangeableRPE;
  try {
    legacy = JSON.parse(raw) as LegacyChangeableRPE;
  } catch {
    // Corrupt data — remove silently, start fresh.
    localStorage.removeItem(LEGACY_KEY);
    return;
  }

  // Map old field names → new DealInputs shape (RPE-12).
  // Annual expenses (Taxes, Insurance, HOA, OtherExpense) are stored annual in the old
  // shape. The new engine takes them with an explicit period flag.
  const migratedInputs = {
    purchasePrice: num(legacy.PurchasePrice),
    percentDown: num(legacy.PercentDown, 20),
    interestRate: num(legacy.InterestRate, 7),
    loanTermYears: num(legacy.LoanTerm, 30),
    closingCosts: 0,
    rollClosingCostsIntoLoan: false,
    grossRent: num(legacy.MonthlyRent),
    vacancyPct: num(legacy.VacancyPct, 5),
    expenses: {
      capExPct: num(legacy.CapExPct, 5),
      maintPct: num(legacy.MaintPct, 5),
      mgmtPct: num(legacy.ManagementPct, 10),
      taxes: { amount: num(legacy.Taxes), period: 'annual' as const },
      insurance: { amount: num(legacy.Insurance), period: 'annual' as const },
      hoa: { amount: num(legacy.HOA), period: 'annual' as const },
      other: { amount: num(legacy.OtherExpense, 1200), period: 'annual' as const },
    },
  };

  const scenario = {
    id: crypto.randomUUID(),
    name: 'Imported (legacy)',
    createdAt: new Date().toISOString(),
    inputs: migratedInputs,
  };

  localStorage.setItem(V1_KEY, JSON.stringify([scenario]));
  localStorage.removeItem(LEGACY_KEY);
}
