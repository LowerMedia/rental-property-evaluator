/**
 * AdSlot.tsx — Gated Google AdSense slot component (RPE-39).
 *
 * Renders nothing (returns null) when client or slot are absent.
 * Dynamically injects the adsbygoogle.js loader script exactly once per
 * page — only when an AdSlot actually mounts. This keeps the WP block and
 * any other embed context that omits adConfig completely free of AdSense
 * network requests and JavaScript.
 *
 * Gates:
 *   1. Context gate  — adConfig prop absent → nothing rendered, no script loaded
 *   2. Safety gate   — empty client / slot string → returns null
 *   3. Print gate    — no-print CSS class hides the slot in print/PDF output
 */

import { useEffect } from 'react';

// Extend Window so TypeScript accepts adsbygoogle without casting.
declare global {
  interface Window {
    // AdSense push queue — array of config objects or empty objects.
    adsbygoogle: Record<string, unknown>[];
  }
}

const SCRIPT_ID = 'rpe-adsense-loader';
let loaderInjected = false;

/**
 * Injects the adsbygoogle.js loader script into <head> exactly once.
 * Subsequent calls are no-ops (guarded by module-level flag + DOM check).
 */
function injectLoader(client: string): void {
  if (loaderInjected || document.getElementById(SCRIPT_ID)) {
    loaderInjected = true;
    return;
  }
  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.async = true;
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`;
  script.crossOrigin = 'anonymous';
  document.head.appendChild(script);
  loaderInjected = true;
}

export interface AdSlotProps {
  /** AdSense publisher client ID — ca-pub-XXXXXXXXXXXXXXXX. */
  client: string;
  /** AdSense ad unit slot ID. */
  slot: string;
  /**
   * Ad format passed to data-ad-format.
   * 'auto' (default) enables responsive sizing.
   */
  format?: string;
  /** Extra CSS class names applied to the wrapper div. */
  className?: string;
}

/**
 * Renders a single responsive AdSense ad unit.
 * Returns null if client or slot are empty (safe no-op for non-ad builds).
 */
export function AdSlot({ client, slot, format = 'auto', className }: AdSlotProps) {
  useEffect(() => {
    if (!client || !slot) return;
    injectLoader(client);
    try {
      (window.adsbygoogle = window.adsbygoogle ?? []).push({});
    } catch {
      // Non-fatal: push errors occur when an ad blocker removes the
      // adsbygoogle array or when the slot has already been filled.
    }
  }, [client, slot]);

  if (!client || !slot) return null;

  return (
    <div
      // Hide from screen readers — ads are presentational, not content.
      aria-hidden="true"
      // no-print: suppressed in window.print() / print media.
      className={`no-print${className ? ` ${className}` : ''}`}
    >
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  );
}
