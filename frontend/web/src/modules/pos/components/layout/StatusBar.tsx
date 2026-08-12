import { useEffect, useState } from 'react';

export function StatusBar({
  connected,
  invoiceNo,
  customerName,
}: {
  connected: boolean;
  invoiceNo: string;
  customerName: string;
}) {
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () => {
      const n = new Date();
      setClock(
        `${n.toLocaleDateString('en-BD')}  ${n.toLocaleTimeString('en-BD', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })}`,
      );
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="sbar">
      <span>
        <span className="sd" style={{ background: connected ? 'var(--accent)' : 'var(--red)' }} />
        {connected ? 'Connected' : 'Disconnected'}
      </span>
      <span>{invoiceNo || '—'}</span>
      <span>{customerName || '—'}</span>
      <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)' }}>{clock}</span>
    </div>
  );
}
