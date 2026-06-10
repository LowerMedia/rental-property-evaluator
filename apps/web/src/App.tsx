import { Evaluator } from '@rpe/ui';
import type { AdConfig } from '@rpe/ui';

/**
 * Build ad config from Vite env vars.
 * adConfig is undefined when VITE_ADS_ENABLED !== 'true', which
 * causes Evaluator to render with zero ad footprint.
 */
const adConfig: AdConfig | undefined =
  import.meta.env['VITE_ADS_ENABLED'] === 'true'
    ? {
        client: import.meta.env['VITE_ADSENSE_CLIENT'] ?? '',
        resultsSlot: import.meta.env['VITE_ADSENSE_SLOT_RESULTS'] ?? '',
      }
    : undefined;

// E11 (RPE-96): cookie-session auth shell. Same-origin only — dev uses
// the Vite /v1 proxy; production must serve SPA + API from one origin.
const authEnabled = import.meta.env['VITE_AUTH_ENABLED'] === 'true';

export default function App() {
  return <Evaluator adConfig={adConfig} authEnabled={authEnabled} />;
}
