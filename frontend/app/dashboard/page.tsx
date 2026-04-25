'use client';

import { useEffect, useRef, useState } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import dynamic from 'next/dynamic';
import AttestationDashboard from '@/components/AttestationDashboard';
import type { AttestationResult } from '@/components/AttestationDashboard';

const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then(m => m.WalletMultiButton),
  { ssr: false }
);

const PROGRAM_ID = new PublicKey('DwiHe1VWW9KXeWXJFaRFoMNzPt3mVs2Ac84gPbaeBkoJ');

const ATTESTATION_DISCRIMINATOR = [247, 195, 134, 60, 216, 249, 121, 183];

// Safe i64 LE reader — works in both browser (no readBigInt64LE) and Node
function readI64LE(buf: Uint8Array, offset: number): number {
  const view = new DataView(buf.buffer, buf.byteOffset + offset, 8);
  const lo = view.getUint32(0, true);
  const hi = view.getInt32(4, true);
  return hi * 0x100000000 + lo;
}

function decodeAttestationAccount(data: Uint8Array): { tier: number; issuedAt: Date; expiresAt: Date } | null {
  // 8 discriminator + 32 owner + 32 issuer + 1 tier + 8 issued_at + 8 expires_at = 89 bytes
  if (data.length < 89) return null;
  for (let i = 0; i < 8; i++) {
    if (data[i] !== ATTESTATION_DISCRIMINATOR[i]) return null;
  }
  const tier = data[72];
  if (tier !== 1 && tier !== 2) return null;
  const issuedAtSecs = readI64LE(data, 73);
  const expiresAtSecs = readI64LE(data, 81);
  if (!isFinite(issuedAtSecs) || !isFinite(expiresAtSecs)) return null;
  return {
    tier,
    issuedAt: new Date(issuedAtSecs * 1000),
    expiresAt: new Date(expiresAtSecs * 1000),
  };
}

interface TxRecord {
  signature: string;
  blockTime: number | null;
  status: 'finalized' | 'confirmed' | 'processed' | 'failed';
}

export default function DashboardPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [result, setResult] = useState<AttestationResult | null>(null);
  const [borrowAmount, setBorrowAmount] = useState(0);
  const [checked, setChecked] = useState(false);
  const [onChainLoading, setOnChainLoading] = useState(false);
  const [txHistory, setTxHistory] = useState<TxRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const { publicKey } = useWallet();
  const { connection } = useConnection();

  // 1. Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('seel_attestation');
      if (stored) {
        const p = JSON.parse(stored);
        const issuedAt = new Date(p.issuedAt);
        const expired = Date.now() > issuedAt.getTime() + 30 * 24 * 60 * 60 * 1000;
        if (!expired) setResult({ ...p, issuedAt });
      }
      const storedBorrow = localStorage.getItem('seel_borrow_amount');
      if (storedBorrow) setBorrowAmount(Number(storedBorrow));
    } catch {}
    setChecked(true);
  }, []);

  // 2. When wallet connects: fetch current attestation + full tx history
  useEffect(() => {
    if (!publicKey || !checked) return;

    const [attestationPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('attestation'), publicKey.toBuffer()],
      PROGRAM_ID
    );

    // Fetch current attestation account
    setOnChainLoading(true);
    connection.getAccountInfo(attestationPda)
      .then(info => {
        if (!info) return;
        const decoded = decodeAttestationAccount(info.data as Uint8Array);
        if (!decoded) return;
        if (!isFinite(decoded.expiresAt.getTime())) return;
        if (Date.now() >= decoded.expiresAt.getTime()) return;
        setResult(prev => {
          const prevTime = prev?.issuedAt?.getTime() ?? 0;
          const decodedTime = decoded.issuedAt.getTime();
          if (isFinite(prevTime) && prevTime >= decodedTime) return prev;
          return { proof: '', tier: decoded.tier, signature: '', issuedAt: decoded.issuedAt };
        });
      })
      .catch(() => {})
      .finally(() => setOnChainLoading(false));

    // Fetch transaction history for the attestation PDA
    setHistoryLoading(true);
    connection.getSignaturesForAddress(attestationPda, { limit: 20 })
      .then(sigs => {
        const records: TxRecord[] = sigs.map(s => ({
          signature: s.signature,
          blockTime: s.blockTime ?? null,
          status: s.err ? 'failed' : (s.confirmationStatus ?? 'confirmed') as TxRecord['status'],
        }));
        setTxHistory(records);
      })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [publicKey, checked, connection]);

  /* ── Particle canvas ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 0, H = 0;
    interface P { x:number; y:number; r:number; vx:number; vy:number; alpha:number; color:string; }
    let particles: P[] = [];
    let animId: number;

    const COLORS = ['rgba(93,184,138,','rgba(106,142,176,','rgba(200,152,40,','rgba(122,104,152,'];
    const resize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; };
    const mkP = (): P => ({ x:Math.random()*W, y:Math.random()*H, r:Math.random()*1.2+0.3, vx:(Math.random()-.5)*.18, vy:(Math.random()-.5)*.18, alpha:Math.random()*.4+.05, color:COLORS[Math.floor(Math.random()*COLORS.length)] });
    const init = () => { particles=[]; const c=Math.min(Math.floor(W*H/14000),80); for(let i=0;i<c;i++) particles.push(mkP()); };
    const draw = () => {
      ctx.clearRect(0,0,W,H);
      for(const p of particles){ p.x+=p.vx; p.y+=p.vy; if(p.x<0)p.x=W; if(p.x>W)p.x=0; if(p.y<0)p.y=H; if(p.y>H)p.y=0; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fillStyle=p.color+p.alpha+')'; ctx.fill(); }
      for(let i=0;i<particles.length;i++) for(let j=i+1;j<particles.length;j++){ const dx=particles[i].x-particles[j].x, dy=particles[i].y-particles[j].y, d=Math.sqrt(dx*dx+dy*dy); if(d<120){ ctx.strokeStyle=`rgba(61,255,192,${(1-d/120)*.07})`; ctx.lineWidth=.5; ctx.beginPath(); ctx.moveTo(particles[i].x,particles[i].y); ctx.lineTo(particles[j].x,particles[j].y); ctx.stroke(); } }
      animId=requestAnimationFrame(draw);
    };
    resize(); init(); draw();
    const onResize = () => { resize(); init(); };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', onResize); };
  }, []);

  return (
    <>
      <div id="crt" />
      <div id="scan" />
      <canvas ref={canvasRef} id="particle-canvas" />
      <div id="noise" />
      <div id="vignette" />

      {/* Nav */}
      <nav id="nav" style={{ position: 'fixed' }}>
        <div className="nav-i" style={{ justifyContent: 'space-between' }}>
          <a href="/" className="nav-logo">SEEL</a>
          <ul className="nav-links" style={{ flex: 1, justifyContent: 'flex-end' }}>
            <li><a href="/dashboard" className="active">DASHBOARD</a></li>
            <li><a href="/launch">LAUNCH</a></li>
          </ul>
          <a
            href="/"
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '0 24px', height: 51,
              fontFamily: 'var(--font-mono)', fontSize: 11,
              letterSpacing: '0.12em', color: 'var(--text-dim)',
              textDecoration: 'none', borderLeft: '1px solid var(--border)',
              transition: 'color 0.15s', whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-dim)')}
          >
            ← BACK TO SITE
          </a>
        </div>
      </nav>

      {/* Background */}
      <div style={{
        position: 'fixed', inset: 0,
        backgroundImage: 'url("/Gustave_Dore_-_Paradiso_Canto_14_Dante_and_Beatrice_translated_to_the_sphere_of_Mars_illustra_-_(MeisterDrucke-611132).jpg")',
        backgroundSize: 'cover', backgroundPosition: 'center',
        opacity: 0.18, zIndex: -1, pointerEvents: 'none',
      }} />

      <div className="content" style={{ paddingTop: 51 }}>
        <div className="dash-wrapper">

          {/* Header */}
          <div className="dash-header">
            <h1 className="dash-title">
              {result ? 'YOUR ATTESTATIONS' : 'NO ATTESTATION YET'}
            </h1>
            <p className="dash-sub">
              {result
                ? 'Your Soulbound income attestation is active. Use it on Kamino or Save to unlock higher LTV borrowing.'
                : publicKey
                  ? onChainLoading
                    ? 'Scanning on-chain attestations for your wallet…'
                    : 'No active attestation found for this wallet. Complete the income proof flow to get one.'
                  : 'Connect your Solana wallet to load on-chain attestations, or complete the income flow to get one.'}
            </p>
            {publicKey && (
              <div style={{
                marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 11,
                color: 'var(--text-muted)', letterSpacing: '0.1em',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                {onChainLoading && (
                  <span style={{ color: 'var(--mint)', animation: 'pulse 1.2s infinite' }}>◈</span>
                )}
                WALLET: {publicKey.toBase58().slice(0, 6)}…{publicKey.toBase58().slice(-4)}
              </div>
            )}
          </div>

          {/* Dashboard panel */}
          {checked && (
            <div className="dash-panel-wrap">
              <AttestationDashboard result={result} borrowAmount={borrowAmount} />
              {!result && (
                <div className="dash-no-attest">
                  <div className="dash-na-icon">◎</div>
                  <div className="dash-na-title">
                    {onChainLoading ? 'SCANNING CHAIN…' : 'ATTESTATION REQUIRED'}
                  </div>
                  {!publicKey && (
                    <div style={{ marginBottom: 16 }}>
                      <p className="dash-na-desc" style={{ marginBottom: 12 }}>
                        Connect your wallet to load any existing on-chain attestation.
                      </p>
                      <WalletMultiButton style={{
                        background: 'rgba(93,184,138,0.12)',
                        border: '1px solid rgba(93,184,138,0.4)',
                        borderRadius: 4,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        letterSpacing: '0.1em',
                        color: 'var(--mint)',
                      }} />
                    </div>
                  )}
                  {publicKey && !onChainLoading && (
                    <p className="dash-na-desc">
                      No active attestation found for this wallet. Prove your income in under 5 minutes —
                      no personal data leaves your browser.
                    </p>
                  )}
                  <a href="/launch" className="btn btn-primary" style={{ marginTop: 8 }}>
                    ▶ GET ATTESTATION →
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Transaction history — shown only when wallet is connected */}
          {publicKey && (
            <div style={{ marginTop: 32, width: '100%', maxWidth: 860 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14,
              }}>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10,
                  color: 'var(--text-muted)', letterSpacing: '0.14em',
                }}>
                  // TRANSACTION HISTORY
                </div>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                {historyLoading && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--mint)', letterSpacing: '0.1em' }}>
                    LOADING…
                  </span>
                )}
              </div>

              {!historyLoading && txHistory.length === 0 && (
                <div style={{
                  padding: '20px 24px',
                  border: '1px solid var(--border)',
                  background: 'rgba(16,20,30,0.6)',
                  fontFamily: 'var(--font-mono)', fontSize: 11,
                  color: 'var(--text-muted)', letterSpacing: '0.1em',
                }}>
                  NO TRANSACTIONS FOUND FOR THIS WALLET
                </div>
              )}

              {txHistory.length > 0 && (
                <div style={{ border: '1px solid var(--border)', background: 'rgba(16,20,30,0.7)' }}>
                  {/* Table header */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 2fr 90px',
                    padding: '8px 16px',
                    borderBottom: '1px solid var(--border)',
                    fontFamily: 'var(--font-mono)', fontSize: 9,
                    color: 'var(--text-muted)', letterSpacing: '0.14em',
                  }}>
                    <span>DATE / TIME</span>
                    <span>SIGNATURE</span>
                    <span style={{ textAlign: 'right' }}>STATUS</span>
                  </div>

                  {txHistory.map((tx, i) => {
                    const date = tx.blockTime ? new Date(tx.blockTime * 1000) : null;
                    const dateStr = date
                      ? date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                      : '—';
                    const timeStr = date
                      ? date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                      : '';
                    const shortSig = `${tx.signature.slice(0, 8)}…${tx.signature.slice(-8)}`;
                    const statusColor = tx.status === 'failed'
                      ? 'var(--red)'
                      : tx.status === 'finalized'
                        ? 'var(--mint)'
                        : 'var(--gold)';

                    return (
                      <div
                        key={tx.signature}
                        style={{
                          display: 'grid', gridTemplateColumns: '1fr 2fr 90px',
                          padding: '10px 16px',
                          borderBottom: i < txHistory.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                          fontFamily: 'var(--font-mono)', fontSize: 11,
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <div style={{ color: 'var(--text)', letterSpacing: '0.06em' }}>{dateStr}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: 9, marginTop: 2 }}>{timeStr}</div>
                        </div>
                        <a
                          href={`https://explorer.solana.com/tx/${tx.signature}?cluster=devnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: 'var(--blue)', letterSpacing: '0.05em',
                            textDecoration: 'none', fontSize: 11,
                          }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--blue)')}
                        >
                          {shortSig} ↗
                        </a>
                        <div style={{ textAlign: 'right', color: statusColor, fontSize: 9, letterSpacing: '0.1em' }}>
                          {tx.status.toUpperCase()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </>
  );
}
