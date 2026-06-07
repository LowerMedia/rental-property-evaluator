/**
 * edit.tsx — Block editor component for rpe/evaluator (RPE-36).
 *
 * Shows a static placeholder in the WordPress block editor. The full
 * interactive app only renders on the frontend (see frontend.tsx).
 */

import type { BlockEditProps } from '@wordpress/blocks';

export function Edit(_props: BlockEditProps) {
  return (
    <div
      style={{
        border: '2px dashed #c7d3de',
        borderRadius: '4px',
        padding: '32px 24px',
        textAlign: 'center',
        background: '#f0f6fc',
        fontFamily: 'sans-serif',
      }}
    >
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#3c434a"
        strokeWidth="1.5"
        style={{ display: 'block', margin: '0 auto 12px' }}
        aria-hidden="true"
      >
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
        <path d="M6 10l3 3 3-3 3 3 3-3" />
      </svg>
      <strong style={{ display: 'block', fontSize: '14px', color: '#1e1e1e' }}>
        Rental Property Evaluator
      </strong>
      <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#646970' }}>
        The full interactive evaluator renders on the frontend.
      </p>
    </div>
  );
}
