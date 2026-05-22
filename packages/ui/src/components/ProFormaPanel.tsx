/**
 * ProFormaPanel — hold-period analysis display (RPE-35).
 *
 * Shows: summary KPI cards (IRR, equity multiple, net sale proceeds, total profit, NPV)
 * followed by a year-by-year projection table.
 */

import type { ProFormaResults, ProjectionYear } from '@rpe/engine';
import { fmtCurrency, fmtPercent, fmtMultiplier, NULL_DISPLAY } from '../utils/format';

// ─── KPI card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  tone?: 'pass' | 'warn' | 'hi' | 'lo';
}

function KpiCard({ label, value, sub, tone = 'hi' }: KpiCardProps) {
  const valueClass =
    tone === 'pass' ? 'text-pass' :
    tone === 'warn' ? 'text-warn' :
    tone === 'lo'   ? 'text-lo'   : 'text-hi';

  return (
    <div className="rounded border border-border bg-surface px-4 py-3 flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] text-lo uppercase tracking-widest truncate">{label}</span>
      <span className={`num text-base font-mono tabular-nums font-semibold ${valueClass}`}>
        {value}
      </span>
      {sub && <span className="text-[10px] text-lo">{sub}</span>}
    </div>
  );
}

// ─── Projection table ─────────────────────────────────────────────────────────

interface ProjectionTableProps {
  rows: ProjectionYear[];
}

function ProjectionTable({ rows }: ProjectionTableProps) {
  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded border border-border bg-surface">
      <table className="w-full text-xs whitespace-nowrap">
        <thead>
          <tr className="text-right text-lo border-b border-border bg-raised">
            <th className="px-3 py-2 text-left font-normal sticky left-0 bg-raised z-10">Yr</th>
            <th className="px-3 py-2 font-normal">NOI / yr</th>
            <th className="px-3 py-2 font-normal">Debt Svc</th>
            <th className="px-3 py-2 font-normal">Cash Flow</th>
            <th className="px-3 py-2 font-normal">Cum. CF</th>
            <th className="px-3 py-2 font-normal">After-Tax CF</th>
            <th className="px-3 py-2 font-normal">Prop. Value</th>
            <th className="px-3 py-2 font-normal">Loan Bal.</th>
            <th className="px-3 py-2 font-normal">Equity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((y) => {
            const cfColor = y.cashFlowAnnual >= 0 ? 'text-pass' : 'text-fail';
            const cumColor = y.cumulativeCashFlow >= 0 ? 'text-pass' : 'text-fail';
            return (
              <tr
                key={y.year}
                className="text-right border-b border-border/50 last:border-b-0 hover:bg-raised/40 transition-colors"
              >
                <td className="px-3 py-1.5 text-left text-lo font-mono sticky left-0 bg-surface z-10">
                  {y.year}
                </td>
                <td className="px-3 py-1.5 num tabular-nums text-mid">
                  {fmtCurrency(y.noiAnnual)}
                </td>
                <td className="px-3 py-1.5 num tabular-nums text-lo">
                  {fmtCurrency(y.annualDebtService)}
                </td>
                <td className={`px-3 py-1.5 num tabular-nums font-semibold ${cfColor}`}>
                  {fmtCurrency(y.cashFlowAnnual)}
                </td>
                <td className={`px-3 py-1.5 num tabular-nums ${cumColor}`}>
                  {fmtCurrency(y.cumulativeCashFlow)}
                </td>
                <td className="px-3 py-1.5 num tabular-nums text-mid">
                  {y.cashFlowAfterTax === null
                    ? <span className="text-lo">{NULL_DISPLAY}</span>
                    : (y.taxSavings ?? 0) > 0
                      ? fmtCurrency(y.cashFlowAfterTax)
                      : <span className="text-lo">{fmtCurrency(y.cashFlowAfterTax)}</span>
                  }
                </td>
                <td className="px-3 py-1.5 num tabular-nums text-mid">
                  {fmtCurrency(y.propertyValue)}
                </td>
                <td className="px-3 py-1.5 num tabular-nums text-lo">
                  {fmtCurrency(y.loanBalance)}
                </td>
                <td className="px-3 py-1.5 num tabular-nums text-hi font-semibold">
                  {fmtCurrency(y.equity)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Exit summary row ─────────────────────────────────────────────────────────

interface ExitSummaryProps {
  salePrice: number | null;
  sellingCosts: number | null;
  netSaleProceeds: number | null;
}

function ExitSummary({ salePrice, sellingCosts, netSaleProceeds }: ExitSummaryProps) {
  if (salePrice === null) return null;
  return (
    <div className="rounded border border-border bg-surface px-4 py-3">
      <p className="text-[10px] text-lo uppercase tracking-widest mb-2">Exit at Sale</p>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
        <span className="text-mid">
          Gross sale price:{' '}
          <span className="num tabular-nums text-hi">{fmtCurrency(salePrice)}</span>
        </span>
        <span className="text-mid">
          Selling costs:{' '}
          <span className="num tabular-nums text-fail">
            {sellingCosts !== null ? `(${fmtCurrency(sellingCosts)})` : NULL_DISPLAY}
          </span>
        </span>
        <span className="text-mid">
          Net proceeds:{' '}
          <span className="num tabular-nums text-pass font-semibold">
            {netSaleProceeds !== null ? fmtCurrency(netSaleProceeds) : NULL_DISPLAY}
          </span>
        </span>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyProForma() {
  return (
    <div className="rounded border border-border bg-surface px-6 py-8 text-center text-sm text-lo">
      Set a <span className="text-mid">Hold Period</span> in the Pro-Forma Settings to generate
      the projection.
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export interface ProFormaPanelProps {
  results: ProFormaResults;
}

export function ProFormaPanel({ results }: ProFormaPanelProps) {
  const { projection, irr, npv, equityMultiple, netSaleProceeds, totalProfit,
          salePrice, sellingCosts } = results;

  const isEmpty = projection.length === 0;

  // IRR signal
  const irrTone = irr === null ? 'lo' : irr >= 15 ? 'pass' : irr >= 8 ? 'warn' : 'hi';
  // Total profit tone
  const profitTone = totalProfit === null ? 'lo' : totalProfit >= 0 ? 'pass' : 'warn';

  return (
    <div className="flex flex-col gap-4">

      {/* ── KPI summary ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Total Profit"
          value={totalProfit !== null ? fmtCurrency(totalProfit, false) : NULL_DISPLAY}
          sub="cumulative incl. sale"
          tone={profitTone}
        />
        <KpiCard
          label="IRR"
          value={irr !== null ? fmtPercent(irr, 1) : NULL_DISPLAY}
          sub="annualised return"
          tone={irrTone}
        />
        <KpiCard
          label="Equity Multiple"
          value={equityMultiple !== null ? fmtMultiplier(equityMultiple, 2) : NULL_DISPLAY}
          sub="total capital returned"
          tone={equityMultiple !== null && equityMultiple >= 1.5 ? 'pass' : 'hi'}
        />
        <KpiCard
          label="Net Sale Proceeds"
          value={netSaleProceeds !== null ? fmtCurrency(netSaleProceeds, false) : NULL_DISPLAY}
          sub="after mortgage + selling costs"
        />
        <KpiCard
          label="NPV"
          value={npv !== null ? fmtCurrency(npv, false) : NULL_DISPLAY}
          sub={npv !== null ? (npv >= 0 ? 'positive — deal beats hurdle' : 'negative — below hurdle') : 'set discount rate to compute'}
          tone={npv === null ? 'lo' : npv >= 0 ? 'pass' : 'warn'}
        />
      </div>

      {/* ── Exit summary ─────────────────────────────────────────────────── */}
      {!isEmpty && (
        <ExitSummary
          salePrice={salePrice}
          sellingCosts={sellingCosts}
          netSaleProceeds={netSaleProceeds}
        />
      )}

      {/* ── Projection table ─────────────────────────────────────────────── */}
      {isEmpty ? (
        <EmptyProForma />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h3 className="section-title text-xs">Year-by-Year Projection</h3>
            <span className="text-[10px] text-lo">{projection.length}-year hold</span>
          </div>
          <ProjectionTable rows={projection} />
        </>
      )}
    </div>
  );
}
