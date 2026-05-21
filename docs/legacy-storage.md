# Legacy localStorage Shape (v0.1.0 / CRA 4)

Documents the data written by the old `RentalPropertyEvaluator.js` app so the migration
shim can produce a valid `rpe.v1.scenarios` entry when it finds old data.

## Old key

```
localStorage.getItem('changeableRPE')
```

Stored as JSON. The value was the `changeable` slice of React state — all inputs as
**strings** (they came from uncontrolled `<input defaultValue>` elements).

## Old shape

```ts
interface LegacyChangeableRPE {
  // Purchase
  PurchasePrice: string;        // e.g. "200000"
  PercentDown: string;          // e.g. "25"  (percent, 0–100)
  InterestRate: string;         // e.g. "4.5" (annual %)
  LoanTerm: string;             // e.g. "30"  (years)

  // Income
  MonthlyRent: string;          // e.g. "2000"

  // Operating expenses — ALL STORED AS ANNUAL despite unclear UI labels
  // (divided by 12 inside TotalMonthlyExpenses calculation)
  Taxes: string;                // annual $
  Insurance: string;            // annual $
  HOA: string;                  // annual $ (default "0")
  OtherExpense: string;         // annual $ (default "1200")

  // Expense %s — stored as percent of monthly rent
  CapExPct: string;             // e.g. "5"
  MaintPct: string;             // e.g. "5"
  ManagementPct: string;        // e.g. "10"
  VacancyPct: string;           // e.g. "5"
}
```

## Known issues in the old shape (don't carry forward)

- All values are strings, not numbers — parse with `parseFloat` / default to 0 on NaN.
- `OtherExpense` default of `"1200"` is annual but was often misread as monthly by users.
- `Insurance`, `Taxes`, `HOA`, `OtherExpense` are **annual** — divide by 12 to get monthly.
- There is no `closingCosts`, `rehab`, `otherIncome`, `sqft`, `units`, or `landValue` field.
- `calculated` was also written to localStorage in some versions — ignore it entirely;
  it is derived and was computed with the wrong formulas anyway.

## Migration target

New storage key: `rpe.v1.scenarios` (JSON array of `SavedScenario`).
See `packages/engine/src/types.ts` (added in RPE-12) for the canonical `DealInputs` shape.

The shim produces one scenario named `"Imported (legacy)"` from the old data.
If `changeableRPE` is absent or unparseable, the shim is a no-op.
After a successful migration the old key is deleted.
