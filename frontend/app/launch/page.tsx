'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import LaunchWizard from '@/components/LaunchWizard';
import AttestationDashboard from '@/components/AttestationDashboard';
import type { AttestationResult } from '@/components/AttestationDashboard';

export default function LaunchPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [result, setResult] = useState<AttestationResult | null>(null);
  const [borrowAmount, setBorrowAmount] = useState(0);

  const handleComplete = useCallback((r: AttestationResult) => {
    setResult(r);
    try {
      localStorage.setItem(
        'seel_attestation',
        JSON.stringify({ ...r, issuedAt: r.issuedAt.toISOString() }),
      );
      if (borrowAmount > 0) {
        localStorage.setItem('seel_borrow_amount', String(borrowAmount));
      }
    } catch {}
  }, [borrowAmount]);

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
            <li><a href="/dashboard">DASHBOARD</a></li>
            <li><a href="/launch" className="active">LAUNCH</a></li>
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

      {/* Background image */}
      <div style={{
        position: 'fixed', inset: 0,
        backgroundImage: 'url("/Gustave_Dore_-_Paradiso_Canto_14_Dante_and_Beatrice_translated_to_the_sphere_of_Mars_illustra_-_(MeisterDrucke-611132).jpg")',
        backgroundSize: 'cover', backgroundPosition: 'center',
        opacity: 0.18, zIndex: -1, pointerEvents: 'none',
      }} />

      {/* Page content */}
      <div className="content" style={{ paddingTop: 51 }}>
        <div className="lp-wrapper">
          <div className="lp-header">
            <h1 className="lp-title">UNLOCK YOUR<br />BORROWING POWER</h1>
            <p className="lp-sub">
              Prove your income with Zero-Knowledge Proofs. Receive a Soulbound attestation
              on Solana. Borrow at up to 80% LTV — without revealing a single byte of personal data.
            </p>
          </div>

          {/* Two-column: wizard + dashboard */}
          <div className="lp-main">
            <LaunchWizard onComplete={handleComplete} onBorrowChange={setBorrowAmount} />
            <AttestationDashboard result={result} borrowAmount={borrowAmount} />
          </div>
        </div>
      </div>
    </>
  );
}
