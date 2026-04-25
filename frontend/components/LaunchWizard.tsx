'use client';

import { useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import OAuthConnect, { AccessCreds } from './OAuthConnect';
import ProofGenerator from './ProofGenerator';
import WalletSelector from './WalletSelector';
import type { AttestationResult } from './AttestationDashboard';

export type { AttestationResult };

type Phase = 'borrow' | 'wallet' | 'oauth' | 'proof' | 'done';

const STEPS: { id: Phase; num: string; label: string }[] = [
  { id: 'borrow', num: '01', label: 'BORROW AMOUNT'  },
  { id: 'wallet', num: '02', label: 'CONNECT WALLET' },
  { id: 'oauth',  num: '03', label: 'LINK INCOME'    },
  { id: 'proof',  num: '04', label: 'GENERATE PROOF' },
  { id: 'done',   num: '05', label: 'ATTESTATION'    },
];

function calcCollateral(amount: number, ltvPct: number): number {
  return ltvPct > 0 ? Math.ceil(amount / (ltvPct / 100)) : 0;
}

interface Props {
  onComplete?: (result: AttestationResult) => void;
  onBorrowChange?: (amount: number) => void;
}

export default function LaunchWizard({ onComplete, onBorrowChange }: Props) {
  const { publicKey } = useWallet();

  const [phase, setPhase] = useState<Phase>('borrow');
  const [borrowAmount, setBorrowAmount] = useState<string>('');
  const [accessCreds, setAccessCreds] = useState<AccessCreds | null>(null);
  const [result, setResult] = useState<AttestationResult | null>(null);

  const borrowNum = parseFloat(borrowAmount) || 0;

  const handleOAuthConnected = useCallback((creds: AccessCreds) => {
    setAccessCreds(creds);
    setPhase('proof');
  }, []);

  const handleProofReady = useCallback(
    (proof: string, tier: number, signature: string) => {
      const r: AttestationResult = { proof, tier, signature, issuedAt: new Date() };
      setResult(r);
      setPhase('done');
      onComplete?.(r);
    },
    [onComplete],
  );

  const phaseIndex = STEPS.findIndex(s => s.id === phase);
  const stepClass = (i: number) =>
    i < phaseIndex ? 'lw-step done' : i === phaseIndex ? 'lw-step active' : 'lw-step';

  return (
    <div className="launch-wizard">
      {/* ── Step Indicator ── */}
      <div className="lw-steps">
        {STEPS.map((s, i) => (
          <div key={s.id} className={stepClass(i)}>
            <div className="lw-step-bar" />
            <div className="lw-step-num">{i < phaseIndex ? '✓' : s.num}</div>
            <div className="lw-step-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Body ── */}
      <div className="lw-body">
        <div className="lw-content">

          {phase === 'borrow' && (
            <>
              <div className="lw-phase-eyebrow">STEP 01 — BORROW AMOUNT</div>
              <h3 className="lw-phase-heading">HOW MUCH DO YOU<br />WANT TO BORROW?</h3>
              <p className="lw-phase-desc">
                Enter your target borrow amount in USDC. SEEL will show you how much
                collateral you save by proving your real-world income.
              </p>

              <div className="lw-borrow-input-wrap">
                <span className="lw-borrow-currency">USDC</span>
                <input
                  className="lw-borrow-input"
                  type="number"
                  min="1"
                  placeholder="e.g. 10000"
                  value={borrowAmount}
                  onChange={e => {
                    setBorrowAmount(e.target.value);
                    onBorrowChange?.(parseFloat(e.target.value) || 0);
                  }}
                />
              </div>

              {borrowNum > 0 && (
                <div className="lw-borrow-comparison">
                  <div className="lw-bc-row lw-bc-row--bad">
                    <span className="lw-bc-label">WITHOUT SEEL&nbsp;&nbsp;<span className="lw-bc-ltv">65% LTV</span></span>
                    <span className="lw-bc-val">${calcCollateral(borrowNum, 65).toLocaleString()} collateral</span>
                  </div>
                  <div className="lw-bc-row lw-bc-row--mid">
                    <span className="lw-bc-label">TIER 1 ≥$2k/mo&nbsp;&nbsp;<span className="lw-bc-ltv">75% LTV</span></span>
                    <span className="lw-bc-val">${calcCollateral(borrowNum, 75).toLocaleString()} collateral</span>
                  </div>
                  <div className="lw-bc-row lw-bc-row--good">
                    <span className="lw-bc-label">TIER 2 ≥$5k/mo&nbsp;&nbsp;<span className="lw-bc-ltv">80% LTV</span></span>
                    <span className="lw-bc-val">${calcCollateral(borrowNum, 80).toLocaleString()} collateral</span>
                  </div>
                  <div className="lw-bc-savings">
                    SAVE&nbsp;
                    <strong>${(calcCollateral(borrowNum, 65) - calcCollateral(borrowNum, 80)).toLocaleString()}</strong>
                    &nbsp;in locked collateral with SEEL Tier 2
                  </div>
                </div>
              )}

              <button
                className="btn btn-primary"
                style={{ marginTop: 28 }}
                disabled={borrowNum <= 0}
                onClick={() => setPhase('wallet')}
              >
                CONTINUE →
              </button>
            </>
          )}

          {phase === 'wallet' && (
            <>
              <div className="lw-phase-eyebrow">STEP 02 — SOLANA WALLET</div>
              <h3 className="lw-phase-heading">CONNECT YOUR<br />SOLANA WALLET</h3>
              <p className="lw-phase-desc">
                Connect your Solana wallet to receive your Soulbound attestation token
                after proof generation. Your address is the only on-chain identifier —
                no name, no email, no KYC.
              </p>
              <WalletSelector onConnected={() => setPhase('oauth')} />
            </>
          )}

          {phase === 'oauth' && (
            <>
              <div className="lw-phase-eyebrow">STEP 03 — INCOME SOURCE</div>
              <h3 className="lw-phase-heading">CONNECT YOUR<br />INCOME SOURCE</h3>
              <p className="lw-phase-desc">
                Link your income source. Your data never leaves your browser —
                only the ZK proof is submitted on-chain. No statements stored. No PII logged.
              </p>
              <div className="lw-provider-row">
                <div className="lw-provider lw-provider--active">
                  <span className="lw-provider-dot" />PLAID<span className="lw-provider-badge">ACTIVE</span>
                </div>
                <div className="lw-provider lw-provider--soon">ARGYLE<span className="lw-provider-badge">SOON</span></div>
                <div className="lw-provider lw-provider--soon">STRIPE<span className="lw-provider-badge">SOON</span></div>
              </div>
              <OAuthConnect onConnected={handleOAuthConnected} />
            </>
          )}

          {phase === 'proof' && accessCreds && (
            <>
              <div className="lw-phase-eyebrow">STEP 04 — ZK PROOF</div>
              <h3 className="lw-phase-heading">GENERATE ZERO-KNOWLEDGE<br />INCOME PROOF</h3>
              <p className="lw-phase-desc">
                The Circom circuit runs entirely in your browser via snarkJS. Income figures, name, and employer
                never leave your device. A small USDC fee covers on-chain attestation minting.
              </p>
              <div className="lw-proof-info">
                <div className="lw-pi-row"><span className="lw-pi-key">CIRCUIT</span><span className="lw-pi-val">income_proof.circom (Circom)</span></div>
                <div className="lw-pi-row"><span className="lw-pi-key">BACKEND</span><span className="lw-pi-val">snarkJS — Groth16 (BN254)</span></div>
                <div className="lw-pi-row"><span className="lw-pi-key">OUTPUTS</span><span className="lw-pi-val">tier: u8 (1 or 2)</span></div>
                <div className="lw-pi-row"><span className="lw-pi-key">PRIVATE</span><span className="lw-pi-val" style={{ color: 'var(--text-muted)' }}>[NEVER LEAVES BROWSER]</span></div>
              </div>
              <div style={{ marginTop: 24 }}>
                <ProofGenerator onProofReady={handleProofReady} accessCreds={accessCreds} />
              </div>
            </>
          )}

          {phase === 'done' && result && (
            <>
              <div className="lw-phase-eyebrow lw-phase-eyebrow--success">ATTESTATION COMPLETE</div>
              <h3 className="lw-phase-heading">SOULBOUND TOKEN<br />MINTED ON SOLANA</h3>
              <p className="lw-phase-desc">
                Your income attestation is live on-chain. The dashboard shows full details
                and lending protocol access — no personal data was revealed.
              </p>
              <div className="lw-done-meta">
                <div className="lw-dm-row">
                  <span className="lw-dm-key">WALLET</span>
                  <span className="lw-dm-val">
                    {publicKey?.toBase58().slice(0, 8)}…{publicKey?.toBase58().slice(-6)}
                  </span>
                </div>
                <div className="lw-dm-row">
                  <span className="lw-dm-key">TIER</span>
                  <span className="lw-dm-val" style={{ color: result.tier === 2 ? 'var(--gold)' : 'var(--mint)' }}>
                    {result.tier === 2 ? 'TIER 2 — PREMIUM' : 'TIER 1 — STANDARD'}
                  </span>
                </div>
                <div className="lw-dm-row">
                  <span className="lw-dm-key">LTV UNLOCK</span>
                  <span className="lw-dm-val" style={{ color: 'var(--gold)' }}>
                    {result.tier === 2 ? '80%' : '75%'}
                  </span>
                </div>
                <div className="lw-dm-row">
                  <span className="lw-dm-key">ISSUED</span>
                  <span className="lw-dm-val">{result.issuedAt.toISOString().slice(0, 10)}</span>
                </div>
                <div className="lw-dm-row">
                  <span className="lw-dm-key">EXPIRES</span>
                  <span className="lw-dm-val">
                    {new Date(result.issuedAt.getTime() + 30 * 24 * 60 * 60 * 1000)
                      .toISOString()
                      .slice(0, 10)}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 0, marginTop: 20, flexWrap: 'wrap' }}>
                <a
                  href={`https://explorer.solana.com/tx/${result.signature}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline"
                >
                  ↗ VIEW ON EXPLORER
                </a>
                <a href="/dashboard" className="btn btn-primary">
                  ◈ OPEN DASHBOARD →
                </a>
                <button
                  className="btn btn-ghost"
                  onClick={() => { setPhase('borrow'); setResult(null); setAccessCreds(null); }}
                >
                  ↺ NEW ATTESTATION
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
