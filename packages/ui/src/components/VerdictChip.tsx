/**
 * Go/no-go verdict chip (RPE-108) — Pass / Marginal / Fail derived from the
 * engine band thresholds (scoreVerdict, the single source of truth). Outlined
 * pill in the verdict hue; theme-aware via the color tokens. Shared by the
 * ScoreCard, the mobile sticky bar, and the Pro-Forma header.
 */
import { scoreVerdict, SCORE_VERDICT_LABEL } from '@rpe/engine';

const VERDICT_TEXT = { pass: 'text-pass', marginal: 'text-warn', fail: 'text-fail' } as const;

export function VerdictChip({ pct, className = '' }: { pct: number; className?: string }) {
  const verdict = scoreVerdict(pct);
  return (
    <span
      className={`inline-flex items-center rounded-full border border-current px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${VERDICT_TEXT[verdict]} ${className}`}
    >
      {SCORE_VERDICT_LABEL[verdict]}
    </span>
  );
}
