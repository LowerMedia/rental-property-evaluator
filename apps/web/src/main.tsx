import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { runLegacyMigration } from './migrate';

// Migrate legacy localStorage data (v0.1.0 CRA shape → v1.0.0) before first render.
runLegacyMigration();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root element not found');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
