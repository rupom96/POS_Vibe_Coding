import 'sweetalert2/dist/sweetalert2.min.css';
import { loadRuntimeConfig } from './config/runtimeConfig';

function showBootError(message: string): void {
  const root = document.getElementById('root');
  if (!root) return;

  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#0d1117;color:#e2e8f0;font-family:Figtree,system-ui,sans-serif;">
      <div style="max-width:520px;width:100%;background:#161b22;border:1px solid #2a3347;border-radius:12px;padding:20px;">
        <h1 style="margin:0 0 8px;font-size:18px;color:#ef4444;">Failed to start DataBiz</h1>
        <p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:#94a3b8;">${message}</p>
        <p style="margin:0;font-size:12px;color:#64748b;">
          If this is a configuration problem, check
          <code style="background:#1c2230;padding:2px 6px;border-radius:4px;">StaticLoginSession.json</code>
          and
          <code style="background:#1c2230;padding:2px 6px;border-radius:4px;">apiSettings.json</code>
          next to <code style="background:#1c2230;padding:2px 6px;border-radius:4px;">index.html</code>.
        </p>
      </div>
    </div>
  `;
}

function showBootLoading(): void {
  const root = document.getElementById('root');
  if (!root) return;
  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0d1117;color:#94a3b8;font-family:Figtree,system-ui,sans-serif;font-size:13px;">
      Loading configuration…
    </div>
  `;
}

showBootLoading();

void loadRuntimeConfig()
  .then(() => import('./bootstrap'))
  .then(({ mountApp }) => mountApp())
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown configuration error';
    showBootError(message);
  });
