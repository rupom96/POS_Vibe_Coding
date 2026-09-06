import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installClientErrorLogging } from './shared/utils/clientActivityLog';

export function mountApp(): void {
  const root = document.getElementById('root');
  if (!root) throw new Error('Root element #root not found');

  installClientErrorLogging();

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
