'use client';

import { useEffect, useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

export interface AttestationResult {
  proof: string;
  tier: number;
  signature: string;
  issuedAt: Date;
}

interface Props {
  result: AttestationResult | null;
  borrowAmount?: number;
}

function calcCollateral(amount: number, ltvPct: number): number {
  return ltvPct > 0 ? Math.ceil(amount / (ltvPct / 100)) : 0;
}

function useCountdown(expiresAt: Date | null): string {
  const [remaining, setRemaining] = useState('');
  useEffect(() => {
    if (!expiresAt) return;
    const update = () => {
      const diff = expiresAt.getTime() - Date.now();
      if (diff <= 0) { setRemaining('EXPIRED'); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setRemaining(`${d}d ${h}h ${m}m`);
    };
    update();
    const iv = setInterval(update, 60000);
    return () => clearInterval(iv);
  }, [expiresAt]);
  return remaining;
}

const PROTOCOLS = [
  { name: 'KAMINO FINANCE', icon: '⬡', baseLtv: 65, desc: 'USDC · SOL · mSOL · jitoSOL' },
  { name: 'SAVE PROTOCOL',  icon: '◈', baseLtv: 65, desc: 'USDC · SOL · USDT' },
];

export default function AttestationDashboard({ result, borrowAmount = 0 }: Props) {
  const { publicKey } = useWallet();
  const expiresAt = useMemo(
    () => result ? new Date(result.issuedAt.getTime() + 30 * 24 * 60 * 60 * 1000) : null,
    [result],
  );
  const countdown = useCountdown(expiresAt);
  const ltv = result ? (result.tier === 2 ? 85 : 80) : 65;
  const saving =
    borrowAmount > 0 && result
      ? calcCollateral(borrowAmount, 65) - calcCollateral(borrowAmount, ltv)
      : 0;

  return (
    <div className="ad-panel">
      {/* Header */}
      <div className="ad-header">
        <div className="ad-header-left">
          <div className={`ad-status-dot${result ? ' ad-status-dot--active' : ''}`} />
          <span className="ad-header-label">BORROWER DASHBOARD</span>
        </div>
        {result && (
          <div className={`ad-tier-badge ad-tier-badge--${result.tier}`}>
            TIER {result.tier}
          </div>
        )}
      </div>

      {/* Attestation Status */}
      <div className="ad-section">
        <div className="ad-section-label">ATTESTATION STATUS</div>
        {result ? (
          <div className="ad-attestation-active">
            <div className="ad-aa-row">
              <span className="ad-aa-key">STATUS</span>
              <span className="ad-aa-val ad-aa-val--mint">◈ ACTIVE</span>
            </div>
            <div className="ad-aa-row">
              <span className="ad-aa-key">TIER</span>
              <span className="ad-aa-val" style={{ color: result.tier === 2 ? 'var(--gold)' : 'var(--mint)' }}>
                {result.tier === 2 ? '2 — PREMIUM ($5k+/mo)' : '1 — STANDARD ($2k+/mo)'}
              </span>
            </div>
            <div className="ad-aa-row">
              <span className="ad-aa-key">LTV UNLOCK</span>
              <span className="ad-aa-val" style={{ color: 'var(--gold)' }}>{ltv}%</span>
            </div>
            <div className="ad-aa-row">
              <span className="ad-aa-key">EXPIRES IN</span>
              <span className="ad-aa-val">{countdown}</span>
            </div>
            {publicKey && (
              <div className="ad-aa-row">
                <span className="ad-aa-key">WALLET</span>
                <span className="ad-aa-val" style={{ fontSize: 10 }}>
                  {publicKey.toBase58().slice(0, 6)}…{publicKey.toBase58().slice(-4)}
                </span>
              </div>
            )}
            <div className="ad-aa-row">
              <span className="ad-aa-key">STANDARD</span>
              <span className="ad-aa-val">SPL Token-2022</span>
            </div>
            <div className="ad-aa-row">
              <span className="ad-aa-key">TRANSFER</span>
              <span className="ad-aa-val" style={{ color: 'var(--text-muted)' }}>SOULBOUND</span>
            </div>
          </div>
        ) : (
          <div className="ad-attestation-pending">
            <div className="ad-ap-icon">◎</div>
            <div className="ad-ap-text">
              Complete the wizard to mint your Soulbound attestation on Solana.
            </div>
            <div className="ad-ap-steps">
              <div className="ad-ap-step">01 — Enter borrow amount</div>
              <div className="ad-ap-step">02 — Connect Solana wallet</div>
              <div className="ad-ap-step">03 — Link income source</div>
              <div className="ad-ap-step">04 — Generate ZK proof</div>
            </div>
          </div>
        )}
      </div>

      {/* Collateral Savings */}
      {borrowAmount > 0 && (
        <div className="ad-section">
          <div className="ad-section-label">
            COLLATERAL SAVINGS — ${borrowAmount.toLocaleString()} USDC
          </div>
          <div className="ad-savings">
            <div className="ad-sav-row ad-sav-row--bad">
              <span>WITHOUT SEEL <span className="ad-sav-ltv">65%</span></span>
              <span>${calcCollateral(borrowAmount, 65).toLocaleString()}</span>
            </div>
            {!result && (
              <>
                <div className="ad-sav-row ad-sav-row--mid">
                  <span>TIER 1 <span className="ad-sav-ltv">80%</span></span>
                  <span>${calcCollateral(borrowAmount, 80).toLocaleString()}</span>
                </div>
                <div className="ad-sav-row ad-sav-row--good">
                  <span>TIER 2 <span className="ad-sav-ltv">85%</span></span>
                  <span>${calcCollateral(borrowAmount, 85).toLocaleString()}</span>
                </div>
              </>
            )}
            {result && (
              <div className="ad-sav-row ad-sav-row--good">
                <span>
                  WITH SEEL TIER {result.tier} <span className="ad-sav-ltv">{ltv}%</span>
                </span>
                <span>${calcCollateral(borrowAmount, ltv).toLocaleString()}</span>
              </div>
            )}
          </div>
          {saving > 0 && (
            <div className="ad-sav-banner">
              SAVING <strong>${saving.toLocaleString()}</strong> IN LOCKED COLLATERAL
            </div>
          )}
          {!result && (
            <div className="ad-sav-banner ad-sav-banner--dim">
              SAVE UP TO{' '}
              <strong>
                ${(calcCollateral(borrowAmount, 65) - calcCollateral(borrowAmount, 85)).toLocaleString()}
              </strong>{' '}
              WITH TIER 2
            </div>
          )}
        </div>
      )}

      {/* Lending Protocols */}
      <div className="ad-section">
        <div className="ad-section-label">LENDING PROTOCOLS</div>
        <div className="ad-protocols">
          {PROTOCOLS.map(p => (
            <div key={p.name} className={`ad-proto-card${result ? ' ad-proto-card--active' : ''}`}>
              <div className="ad-pc-header">
                <span className="ad-pc-icon">{p.icon}</span>
                <span className="ad-pc-name">{p.name}</span>
                <span
                  className="ad-pc-ltv"
                  style={{ color: result ? 'var(--gold)' : 'var(--text-muted)' }}
                >
                  {result ? `${ltv}% LTV` : `${p.baseLtv}% LTV`}
                </span>
              </div>
              <div className="ad-pc-desc">{p.desc}</div>
              <div className={`ad-pc-badge${result ? ' ad-pc-badge--unlocked' : ''}`}>
                {result ? 'SEEL UNLOCKED' : 'ATTESTATION REQUIRED'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats strip */}
      <div className="ad-stats">
        <div className="ad-stat">
          <span className="ad-stat-val" style={{ color: 'var(--mint)' }}>~5m</span>
          <span className="ad-stat-label">Time to Attest</span>
        </div>
        <div className="ad-stat">
          <span className="ad-stat-val" style={{ color: 'var(--gold)' }}>~10s</span>
          <span className="ad-stat-label">Proof Gen</span>
        </div>
        <div className="ad-stat">
          <span className="ad-stat-val">6k+</span>
          <span className="ad-stat-label">Banks</span>
        </div>
        <div className="ad-stat">
          <span className="ad-stat-val" style={{ color: 'var(--red)' }}>$0</span>
          <span className="ad-stat-label">PII</span>
        </div>
      </div>

      {/* Actions (only when attested) */}
      {result && (
        <div className="ad-actions">
          <a
            href={`https://explorer.solana.com/tx/${result.signature}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline"
          >
            ↗ EXPLORER
          </a>
        </div>
      )}
    </div>
  );
}
