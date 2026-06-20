/**
 * E10 — headless PDF report (RPE-78)
 *
 * Approach: PROGRAMMATIC via pdf-lib (vs HTML-to-PDF/Chromium).
 * Trade-off, recorded per the ticket: pdf-lib is pure JS with zero
 * native/browser dependencies — millisecond generation and tiny
 * serverless cold starts — at the cost of hand-built layout instead of
 * reusing report HTML/CSS. For a tabular metrics report the layout cost
 * is small and fidelity is deterministic; if a designed brochure-style
 * report is ever wanted, an HTML pipeline can sit beside this one.
 *
 * Rendered from the canonical DealReport (RPE-77) so JSON/CSV/PDF stay
 * consistent. Deterministic: with a fixed meta.generatedAt the output
 * bytes are identical run-to-run (creation/mod dates are pinned to it).
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { fmtCurrency, fmtMultiplier, fmtPercent } from './format';
import { SCORE_VERDICT_LABEL } from '@rpe/engine';
import type { DealReport } from './report';

const PAGE = { width: 595.28, height: 841.89 } as const; // A4 portrait, points
const MARGIN = 50;
const LINE = 16;

const INK = rgb(0.07, 0.07, 0.07);
const MID = rgb(0.4, 0.4, 0.4);
const PASS = rgb(0.09, 0.4, 0.2);
const WARN = rgb(0.72, 0.52, 0.04);
const FAIL = rgb(0.6, 0.11, 0.11);

interface Cursor {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  bold: PDFFont;
}

function newPage(c: Cursor): void {
  c.page = c.doc.addPage([PAGE.width, PAGE.height]);
  c.y = PAGE.height - MARGIN;
}

function ensureRoom(c: Cursor, lines: number): void {
  if (c.y - lines * LINE < MARGIN) newPage(c);
}

function text(c: Cursor, value: string, opts: { x?: number; size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {}): void {
  c.page.drawText(value, {
    x: opts.x ?? MARGIN,
    y: c.y,
    size: opts.size ?? 10,
    font: opts.bold === true ? c.bold : c.font,
    color: opts.color ?? INK,
  });
}

function line(c: Cursor): void {
  c.y -= LINE;
}

/** Render the canonical report as a PDF. Resolves to the document bytes. */
export async function reportToPdf(report: DealReport): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Deterministic output for a fixed generatedAt
  const generated = new Date(report.meta.generatedAt);
  doc.setCreationDate(generated);
  doc.setModificationDate(generated);
  doc.setTitle('Rental Property Evaluation Report');
  doc.setProducer('@rpe/report');

  const c: Cursor = { doc, page: doc.addPage([PAGE.width, PAGE.height]), y: 0, font, bold };
  c.y = PAGE.height - MARGIN;

  // ── Header ───────────────────────────────────────────────────────────
  text(c, 'Rental Property Evaluation Report', { size: 18, bold: true });
  c.y -= 22;
  text(c, `Generated ${report.meta.generatedAt} · engine ${report.meta.engineVersion} · mode ${report.meta.mode}`, {
    size: 8,
    color: MID,
  });
  c.y -= 24;

  // ── Deal summary ─────────────────────────────────────────────────────
  text(c, 'Deal Summary', { size: 12, bold: true });
  line(c);
  const i = report.inputs;
  const summary = [
    `Purchase price ${fmtCurrency(i.purchasePrice)} · ${fmtPercent(i.percentDown, 0)} down · ` +
      `${fmtPercent(i.interestRate)} / ${i.loanTermYears} yr`,
    `Gross rent ${fmtCurrency(i.grossRent)}/mo · vacancy ${fmtPercent(i.vacancyPct, 0)} · ` +
      `taxes ${fmtCurrency(i.expenses.taxes.amount)}/${i.expenses.taxes.period} · ` +
      `insurance ${fmtCurrency(i.expenses.insurance.amount)}/${i.expenses.insurance.period}`,
  ];
  for (const s of summary) {
    text(c, s, { size: 9 });
    line(c);
  }
  c.y -= 8;

  // ── Score ────────────────────────────────────────────────────────────
  const verdictColor =
    report.score.verdict === 'pass' ? PASS : report.score.verdict === 'marginal' ? WARN : FAIL;
  text(c, `Verdict: ${SCORE_VERDICT_LABEL[report.score.verdict]} — ${report.score.passing} / ${report.score.total} metrics passing (${report.score.pct.toFixed(0)}%)`, {
    size: 12,
    bold: true,
    color: verdictColor,
  });
  c.y -= 24;

  // ── Metrics table ────────────────────────────────────────────────────
  text(c, 'Metrics', { size: 12, bold: true });
  line(c);
  let currentGroup = '';
  for (const metric of report.metrics) {
    ensureRoom(c, 2);
    if (metric.group !== currentGroup) {
      currentGroup = metric.group;
      c.y -= 4;
      text(c, currentGroup, { size: 9, bold: true, color: MID });
      line(c);
    }
    text(c, metric.label, { x: MARGIN + 12, size: 9 });
    text(c, metric.formatted, { x: 300, size: 9 });
    if (metric.signal === 'pass' || metric.signal === 'fail') {
      text(c, metric.signal.toUpperCase(), {
        x: 420,
        size: 8,
        bold: true,
        color: metric.signal === 'pass' ? PASS : FAIL,
      });
    }
    line(c);
  }

  // ── Pro-forma ────────────────────────────────────────────────────────
  if (report.proForma !== null && report.proForma.projection.length > 0) {
    c.y -= 12;
    ensureRoom(c, report.proForma.projection.length + 10);
    text(c, 'Pro-Forma Projection', { size: 12, bold: true });
    line(c);
    const cols = [MARGIN + 12, 110, 200, 290, 380, 470];
    const headers = ['Year', 'Cash Flow', 'NOI', 'Value', 'Loan', 'Equity'];
    headers.forEach((h, idx) => text(c, h, { x: cols[idx], size: 8, bold: true, color: MID }));
    line(c);
    for (const year of report.proForma.projection) {
      ensureRoom(c, 1);
      const cells = [
        String(year.year),
        fmtCurrency(year.cashFlowAnnual),
        fmtCurrency(year.noiAnnual),
        fmtCurrency(year.propertyValue),
        fmtCurrency(year.loanBalance),
        fmtCurrency(year.equity),
      ];
      cells.forEach((v, idx) => text(c, v, { x: cols[idx], size: 8 }));
      line(c);
    }
    c.y -= 8;
    ensureRoom(c, 5);
    text(c, 'Hold Summary', { size: 10, bold: true });
    line(c);
    const hold = report.proForma;
    for (const [label, value] of [
      ['IRR', fmtPercent(hold.irr)],
      ['NPV', fmtCurrency(hold.npv, true)],
      ['Equity Multiple', fmtMultiplier(hold.equityMultiple)],
      ['Net Sale Proceeds', fmtCurrency(hold.netSaleProceeds, true)],
      ['Total Profit', fmtCurrency(hold.totalProfit, true)],
    ] as const) {
      ensureRoom(c, 1);
      text(c, label, { x: MARGIN + 12, size: 9 });
      text(c, value, { x: 300, size: 9 });
      line(c);
    }
  }

  return doc.save();
}
