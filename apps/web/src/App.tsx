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

export default function App() {
  return <Evaluator adConfig={adConfig} />;
}
