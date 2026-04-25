'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletReadyState, type WalletName } from '@solana/wallet-adapter-base';

interface Props {
  onConnected: () => void;
}

export default function WalletSelector({ onConnected }: Props) {
  const { wallets, select, connect, disconnect, connected, connecting, publicKey, wallet: selectedWallet } = useWallet();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // After select(), trigger connect
  useEffect(() => {
    if (!selectedWallet || !pending) return;
    if (selectedWallet.adapter.name !== pending) return;
    setError(null);
    connect().catch((err: Error) => {
      setError(err?.message ?? 'Connection rejected');
      setPending(null);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWallet]);

  const handlePick = useCallback(
    (name: WalletName) => {
      setError(null);
      setPending(name);
      select(name);
    },
    [select],
  );

  // Already connected: show confirmation panel, user clicks Continue manually
  // Guard with `mounted` to avoid SSR/client hydration mismatch
  if (mounted && connected && selectedWallet) {
    const addr = publicKey?.toBase58() ?? '';
    return (
      <div className="ws-wrap">
        <div className="ws-row ws-row--installed" style={{ pointerEvents: 'none' }}>
          <img
            src={selectedWallet.adapter.icon}
            alt={selectedWallet.adapter.name}
            className="ws-logo"
            width={36}
            height={36}
          />
          <div className="ws-info">
            <span className="ws-name">{selectedWallet.adapter.name}</span>
            <span className="ws-state ws-state--on">CONNECTED</span>
          </div>
          <span className="ws-cta" style={{ color: 'var(--mint)', fontSize: 11 }}>
            {addr.slice(0, 4)}…{addr.slice(-4)}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={onConnected}>
            CONTINUE →
          </button>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 12 }}
            onClick={() => { disconnect(); setError(null); }}
          >
            SWITCH WALLET
          </button>
        </div>
      </div>
    );
  }

  // Guard SSR: wallet list is only available in the browser
  if (!mounted) return <div className="ws-wrap" />;

  // Not connected: show wallet picker list
  const sorted = [...wallets].sort((a, b) => {
    const rank = {
      [WalletReadyState.Installed]:    0,
      [WalletReadyState.Loadable]:     1,
      [WalletReadyState.NotDetected]:  2,
      [WalletReadyState.Unsupported]:  3,
    } as Record<string, number>;
    return (rank[a.readyState] ?? 3) - (rank[b.readyState] ?? 3);
  });

  return (
    <div className="ws-wrap">
      {sorted.map(w => {
        const installed  = w.readyState === WalletReadyState.Installed;
        const loadable   = w.readyState === WalletReadyState.Loadable;
        const detected   = installed || loadable;
        const isPending  = pending === w.adapter.name && connecting;

        return (
          <button
            key={w.adapter.name}
            className={`ws-row${installed ? ' ws-row--installed' : ''}${isPending ? ' ws-row--pending' : ''}`}
            onClick={() => detected ? handlePick(w.adapter.name as WalletName) : window.open(w.adapter.url, '_blank')}
            disabled={connecting}
            title={detected ? `Connect with ${w.adapter.name}` : `Install ${w.adapter.name}`}
          >
            <img
              src={w.adapter.icon}
              alt={w.adapter.name}
              className="ws-logo"
              width={36}
              height={36}
            />
            <div className="ws-info">
              <span className="ws-name">{w.adapter.name}</span>
              <span className={`ws-state${installed ? ' ws-state--on' : ''}`}>
                {isPending
                  ? 'CONNECTING…'
                  : installed
                    ? 'DETECTED'
                    : loadable
                      ? 'AVAILABLE'
                      : 'NOT INSTALLED'}
              </span>
            </div>
            <span className={`ws-cta${!detected ? ' ws-cta--dim' : ''}`}>
              {isPending ? '⏳' : detected ? 'CONNECT →' : '↗ INSTALL'}
            </span>
          </button>
        );
      })}

      {error && (
        <div className="ws-error">
          <span style={{ color: 'var(--red)' }}>✕</span> {error}
        </div>
      )}

      {wallets.length === 0 && (
        <div className="ws-empty">
          No Solana wallets detected.{' '}
          <a href="https://phantom.app" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--mint)' }}>
            Install Phantom ↗
          </a>
        </div>
      )}
    </div>
  );
}
