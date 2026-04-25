'use client';

import { useEffect, useRef, useState } from 'react';
import LaunchSection from '@/components/LaunchSection';

function calcCollateral(amount: number, ltvPct: number): number {
  return ltvPct > 0 ? Math.ceil(amount / (ltvPct / 100)) : 0;
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────
export default function Home() {

  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const [calcAmount, setCalcAmount] = useState(1000);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const uptimeRef = useRef<HTMLSpanElement>(null);
  const lastScrollYRef = useRef(0);
  const bgLayerRefs = useRef<(HTMLDivElement | null)[]>(Array(6).fill(null));

  // ── Particle canvas ──────────────────────────────────────
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

    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };
    const mkParticle = (): P => ({
      x: Math.random()*W, y: Math.random()*H,
      r: Math.random()*1.2+0.3,
      vx: (Math.random()-0.5)*0.18, vy: (Math.random()-0.5)*0.18,
      alpha: Math.random()*0.4+0.05,
      color: COLORS[Math.floor(Math.random()*COLORS.length)],
    });
    const init = () => {
      particles = [];
      const count = Math.min(Math.floor(W*H/14000), 80);
      for (let i=0; i<count; i++) particles.push(mkParticle());
    };
    const draw = () => {
      ctx.clearRect(0,0,W,H);
      for (const p of particles) {
        p.x+=p.vx; p.y+=p.vy;
        if (p.x<0) p.x=W; if (p.x>W) p.x=0;
        if (p.y<0) p.y=H; if (p.y>H) p.y=0;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle=p.color+p.alpha+')'; ctx.fill();
      }
      for (let i=0; i<particles.length; i++) {
        for (let j=i+1; j<particles.length; j++) {
          const dx=particles[i].x-particles[j].x, dy=particles[i].y-particles[j].y;
          const dist=Math.sqrt(dx*dx+dy*dy);
          if (dist<120) {
            ctx.strokeStyle=`rgba(61,255,192,${(1-dist/120)*0.07})`;
            ctx.lineWidth=0.5; ctx.beginPath();
            ctx.moveTo(particles[i].x,particles[i].y);
            ctx.lineTo(particles[j].x,particles[j].y); ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    };

    resize(); init(); draw();
    const onResize = () => { resize(); init(); };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', onResize); };
  }, []);

  // ── Scroll: parallax + nav active + hide/show ────────────
  useEffect(() => {
    const eio = (t:number) => t<0.5 ? 2*t*t : -1+(4-2*t)*t;
    const layerOpacity = (prog:number, center:number, hw:number) => {
      const dist = Math.abs(prog-center);
      if (dist>=hw) return 0;
      const plateau = hw*0.40;
      return dist<=plateau ? 1 : eio(1-(dist-plateau)/(hw-plateau));
    };
    const speeds  = [0.20, 0.17, 0.14, 0.11, 0.08, 0.05];
    const centers = [0.00, 0.20, 0.40, 0.58, 0.76, 1.00];
    const hw = 0.34;

    const checkReveal = () => {
      document.querySelectorAll<HTMLElement>('.reveal:not(.visible)').forEach(el => {
        if (el.getBoundingClientRect().top < window.innerHeight*0.88) el.classList.add('visible');
      });
    };
    const updateNav = () => {
      const secs  = document.querySelectorAll<HTMLElement>('section[id]');
      const links = document.querySelectorAll<HTMLElement>('.nav-links a[href^="#"]');
      let current = '';
      secs.forEach(s => { if (window.scrollY >= s.offsetTop-120) current = s.id; });
      links.forEach(l => l.classList.toggle('active', l.getAttribute('href')==='#'+current));
    };
    const onScroll = () => {
      const st = window.scrollY;
      const dh = document.documentElement.scrollHeight - window.innerHeight;
      const prog = Math.min(1, st/Math.max(dh,1));
      bgLayerRefs.current.forEach((el,i) => {
        if (!el) return;
        el.style.transform = `translateY(${st*speeds[i]}px)`;
        el.style.opacity = String(layerOpacity(prog, centers[i], hw));
      });
      updateNav(); checkReveal();
      const nav = navRef.current;
      if (nav && st>60) {
        nav.style.transform = st > lastScrollYRef.current+4 ? 'translateY(-100%)' : 'translateY(0)';
        nav.style.transition = 'transform 0.3s cubic-bezier(0.16,1,0.3,1)';
      } else if (nav) {
        nav.style.transform = 'translateY(0)';
      }
      lastScrollYRef.current = st;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // ── Reveal via IntersectionObserver ──────────────────────
  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }),
      { threshold: 0.1 }
    );
    document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  // ── Progress bar animation ────────────────────────────────
  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const bar = entry.target as HTMLElement;
        const target = bar.style.width;
        bar.style.transition = 'none'; bar.style.width = '0%';
        requestAnimationFrame(() => setTimeout(() => {
          bar.style.transition = 'width 0.9s cubic-bezier(0.16,1,0.3,1)';
          bar.style.width = target;
        }, 80));
        obs.unobserve(bar);
      });
    }, { threshold: 0.2 });
    document.querySelectorAll<HTMLElement>('.pfill').forEach(b => obs.observe(b));
    return () => obs.disconnect();
  }, []);

  // ── Uptime counter ────────────────────────────────────────
  useEffect(() => {
    const t0 = Date.now();
    const pad = (n:number) => String(n).padStart(2,'0');
    const iv = setInterval(() => {
      if (!uptimeRef.current) return;
      const s = Math.floor((Date.now()-t0)/1000);
      uptimeRef.current.textContent = `${pad(Math.floor(s/3600))}:${pad(Math.floor((s%3600)/60))}:${pad(s%60)}`;
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  // ── Step card hover glow ──────────────────────────────────
  useEffect(() => {
    type Handler = { el:HTMLElement; mm:(e:MouseEvent)=>void; ml:()=>void };
    const hs: Handler[] = [];
    document.querySelectorAll<HTMLElement>('.step').forEach(step => {
      const mm = (e:MouseEvent) => {
        const r=step.getBoundingClientRect(), x=e.clientX-r.left, y=e.clientY-r.top;
        step.style.background=`radial-gradient(circle at ${x}px ${y}px, rgba(93,184,138,0.06) 0%, rgba(16,20,30,0.88) 55%)`;
      };
      const ml = () => { step.style.background=''; };
      step.addEventListener('mousemove', mm);
      step.addEventListener('mouseleave', ml);
      hs.push({el:step, mm, ml});
    });
    return () => hs.forEach(({el,mm,ml}) => { el.removeEventListener('mousemove',mm); el.removeEventListener('mouseleave',ml); });
  }, []);

  // ── Card tilt ─────────────────────────────────────────────
  useEffect(() => {
    type TH = { el:HTMLElement; mm:(e:MouseEvent)=>void; ml:()=>void; me:()=>void };
    const hs: TH[] = [];
    document.querySelectorAll<HTMLElement>('.rev-card, .tier-card').forEach(card => {
      const mm = (e:MouseEvent) => {
        const r=card.getBoundingClientRect();
        const x=(e.clientX-r.left)/r.width-0.5, y=(e.clientY-r.top)/r.height-0.5;
        card.style.transform=`perspective(600px) rotateY(${x*4}deg) rotateX(${-y*4}deg) translateZ(2px)`;
      };
      const ml = () => { card.style.transform=''; card.style.transition='transform 0.4s ease'; };
      const me = () => { card.style.transition='transform 0.1s ease'; };
      card.addEventListener('mousemove', mm);
      card.addEventListener('mouseleave', ml);
      card.addEventListener('mouseenter', me);
      hs.push({el:card, mm, ml, me});
    });
    return () => hs.forEach(({el,mm,ml,me}) => {
      el.removeEventListener('mousemove',mm); el.removeEventListener('mouseleave',ml); el.removeEventListener('mouseenter',me);
    });
  }, []);

  // ── JSX ───────────────────────────────────────────────────
  return (
    <>
      {/* Fixed overlays */}
      <div id="crt" />
      <div id="scan" />
      <canvas ref={canvasRef} id="particle-canvas" />

      {/* Background layers */}
      <div id="bg-canvas">
        <div className="bg-layer" id="bg-dark"    ref={el => { bgLayerRefs.current[0] = el; }} />
        <div className="bg-layer" id="bg-ascent"  ref={el => { bgLayerRefs.current[1] = el; }} />
        <div className="bg-layer" id="bg-paradise"ref={el => { bgLayerRefs.current[2] = el; }} />
        <div className="bg-layer" id="bg-book"    ref={el => { bgLayerRefs.current[3] = el; }} />
        <div className="bg-layer" id="bg-preview" ref={el => { bgLayerRefs.current[4] = el; }} />
        <div className="bg-layer" id="bg-stars"   ref={el => { bgLayerRefs.current[5] = el; }} />
        <div id="bg-grid" />
      </div>
      <div id="noise" />
      <div id="vignette" />

      {/* NAV */}
      <nav id="nav" ref={navRef as React.RefObject<HTMLElement>}>
        <div className="nav-i">
          <a href="#hero" className="nav-logo">SEEL</a>
          <ul className="nav-links">
            <li><a href="#problem">PROBLEM</a></li>
            <li><a href="#how">PROTOCOL</a></li>
            <li><a href="#demo">CALCULATOR</a></li>
            <li><a href="#tiers">ATTESTATION</a></li>
            <li><a href="#tech">TECH</a></li>
            <li><a href="#compare">LANDSCAPE</a></li>
            <li><a href="/launch">LAUNCH</a></li>
          </ul>
          <button
            className="nav-hamburger"
            aria-label="Menu"
            onClick={() => setHamburgerOpen(o => !o)}
          >
            <span style={hamburgerOpen ? {transform:'rotate(45deg) translate(4px,4px)'} : {}} />
            <span style={hamburgerOpen ? {opacity:'0'} : {}} />
            <span style={hamburgerOpen ? {transform:'rotate(-45deg) translate(4px,-4px)'} : {}} />
          </button>
        </div>
      </nav>

      {/* Mobile nav */}
      <nav className={`mobile-nav${hamburgerOpen ? ' open' : ''}`}>
        {(['problem','how','demo','tiers','tech','compare'] as const).map(id => (
          <a key={id} href={`#${id}`} className="mob-link" onClick={() => setHamburgerOpen(false)}>
            {id === 'demo' ? 'Calculator' : id.charAt(0).toUpperCase()+id.slice(1)}
          </a>
        ))}
        <a href="/launch" className="mob-link" onClick={() => setHamburgerOpen(false)}>
          Launch
        </a>
      </nav>

      <div className="content">

        {/* ═════════ HERO ════════════════════════════════════════ */}
        <section className="hero" id="hero">
          <h1 className="hero-title">
            <span className="ht-line"><span className="ht-inner l1">PROVE YOUR</span></span>
            <span className="ht-line"><span className="ht-inner l2">INCOME.</span></span>
            <span className="ht-line"><span className="ht-inner l3">BORROW MORE.</span></span>
          </h1>
          <div className="hero-divider" />
          <p className="hero-sub">
            Borrow more on Solana by proving your real-world income,<br />
            <em>without revealing it.</em><br />
            Zero-knowledge. Zero overcollateralization. Zero data on-chain.
          </p>
          <div className="hero-stats">
            <div className="hs-item">
              <span className="hs-val" style={{color:'var(--text)'}}>$0</span>
              <span className="hs-label">On-Chain Exposure</span>
            </div>
            <div className="hs-item">
              <span className="hs-val" style={{color:'var(--gold)'}}>30D</span>
              <span className="hs-label">Attestation Validity</span>
            </div>
            <div className="hs-item">
              <span className="hs-val" style={{color:'var(--mint)'}}>80%</span>
              <span className="hs-label">Max LTV Unlocked</span>
            </div>
          </div>
          <div className="cta-row">
            <a href="#how"    className="btn btn-primary">▶ HOW IT WORKS</a>
            <a href="#demo"   className="btn btn-ghost">⬡ CALCULATOR</a>
            <a href="/launch" className="btn btn-outline">⚠ GET ATTESTATION</a>
          </div>
        </section>

        {/* ═════════ SECTION 01: PROBLEM ═══════════════════════ */}
        <div className="layer-marker">
          <div className="lm-num">// SECTION_01</div>
          <div className="lm-title" style={{color:'var(--red)'}}>THE PROBLEM — OVERCOLLATERALIZATION</div>
          <div className="lm-sep" />
          <div className="lm-tag">DEFI IS BROKEN FOR REAL PEOPLE</div>
        </div>

        <section className="section" id="problem">
          <div className="sec-hdr">
            <div className="sec-tag">THE PROBLEM</div>
            <h2 className="sec-title">DeFi DEMANDS TOO MUCH</h2>
          </div>
          <div className="problem-quote reveal">
            <div className="pq-line">
              <span className="pq-1">$1,000 LOAN.</span>
              <span className="pq-sep">//</span>
              <span className="pq-2">$1,500 COLLATERAL.</span>
              <span className="pq-sep">//</span>
              <span className="pq-3">THAT'S BROKEN.</span>
            </div>
            <p className="pq-body">
              Every Solana lending protocol runs on overcollateralization. Kamino, Save, MarginFi — all require locking up more than you borrow. If you have a salary, a job, a verifiable income stream?{' '}
              <span>DeFi doesn't care. It only sees your on-chain balance.</span><br /><br />
              Traditional finance solved this decades ago with income verification. DeFi has no equivalent — because nobody wants to share their bank statement on-chain. Until now.
            </p>
          </div>
          <div className="compare-grid reveal">
            <div className="compare-col bad">
              <div className="compare-head">▶ WITHOUT SEEL</div>
              <div className="compare-item"><span className="ci-bad">✕</span>$1,300–$1,500 locked for every $1,000 borrowed</div>
              <div className="compare-item"><span className="ci-bad">✕</span>65% LTV ceiling — capital trapped on-chain</div>
              <div className="compare-item"><span className="ci-bad">✕</span>Real-world income completely ignored</div>
              <div className="compare-item"><span className="ci-bad">✕</span>Must already hold crypto to borrow crypto</div>
              <div className="compare-item"><span className="ci-bad">✕</span>TradFi earners locked out of DeFi yield</div>
            </div>
            <div className="compare-col good">
              <div className="compare-head">▶ WITH SEEL</div>
              <div className="compare-item"><span className="ci-good">✓</span>Borrow against your verified income capacity</div>
              <div className="compare-item"><span className="ci-good">✓</span>Up to 80% LTV — more purchasing power</div>
              <div className="compare-item"><span className="ci-good">✓</span>Plaid income accepted (Argyle &amp; Stripe coming soon)</div>
              <div className="compare-item"><span className="ci-good">✓</span>Zero identity disclosure. Zero PII on-chain.</div>
              <div className="compare-item"><span className="ci-good">✓</span>Soulbound attestation. Auto-expires in 30 days.</div>
            </div>
          </div>
        </section>

        {/* ═════════ SECTION 02: PROTOCOL FLOW ════════════════ */}
        <div className="layer-marker">
          <div className="lm-num">// SECTION_02</div>
          <div className="lm-title" style={{color:'var(--mint)'}}>PROTOCOL FLOW — ZK INCOME PROOF</div>
          <div className="lm-sep" />
          <div className="lm-tag">4 STEPS // CLIENT-SIDE ONLY // PRIVATE</div>
        </div>

        <section className="section" id="how" style={{position:'relative',overflow:'hidden'}}>
          <div className="proto-bg"><div className="proto-grid" /></div>
          <div className="sec-hdr">
            <div className="sec-tag">PROTOCOL FLOW</div>
            <h2 className="sec-title">FOUR STEPS TO UNLOCK YOUR CREDIT</h2>
          </div>
          <div className="steps">
            <div className="step reveal">
              <div className="step-num">01</div>
              <div className="step-icon">[ OAUTH.CONNECT ]</div>
              <div className="step-title">CONNECT INCOME SOURCE</div>
              <p className="step-desc">Connect via OAuth to your income provider. Plaid links to 6,000+ banks. Argyle (coming soon) and Stripe (coming soon) support will be added for payroll and freelancer income. No passwords stored — OAuth tokens only.</p>
              <div className="step-tags"><span className="tag">PLAID</span><span className="tag tag-soon">ARGYLE — SOON</span><span className="tag tag-soon">STRIPE — SOON</span><span className="tag">OAUTH 2.0</span></div>
            </div>
            <div className="step-arrow">▶</div>
            <div className="step reveal reveal-delay-1">
              <div className="step-num">02</div>
              <div className="step-icon">[ ZK.CIRCUIT ]</div>
              <div className="step-title">CLIENT-SIDE ZK PROOF</div>
              <p className="step-desc">The API response never reaches a server. Your browser runs a ZK circuit (Circom + snarkJS): does this data show 6+ months of recurring income above the threshold? Output: boolean. No name, employer, or exact figure leaves your device.</p>
              <div className="step-tags"><span className="tag">CIRCOM / SNARKJS</span><span className="tag">CLIENT-SIDE</span><span className="tag">1–3s VERIFY</span></div>
            </div>
            <div className="step-arrow">▶</div>
            <div className="step reveal reveal-delay-2">
              <div className="step-num">03</div>
              <div className="step-icon">[ ANCHOR.MINT ]</div>
              <div className="step-title">SOLANA ATTESTATION</div>
              <p className="step-desc">The proof is submitted to an on-chain Anchor program. The program verifies the ZK proof and mints a Soulbound SPL Token-2022 credit attestation. Non-transferable. Contains income band only. Auto-expires in 30 days.</p>
              <div className="step-tags"><span className="tag">ANCHOR</span><span className="tag">SPL TOKEN-2022</span><span className="tag">SOULBOUND</span></div>
            </div>
            <div className="step-arrow">▶</div>
            <div className="step reveal reveal-delay-3">
              <div className="step-num">04</div>
              <div className="step-icon">[ PROTOCOL.BORROW ]</div>
              <div className="step-title">BORROW AT HIGHER LTV</div>
              <p className="step-desc">SEEL-integrated lending protocols read your attestation and unlock better LTV ratios, higher limits, or lower rates via SDK. The protocol never sees who you are. It only sees a verified income tier — nothing more.</p>
              <div className="step-tags"><span className="tag">KAMINO</span><span className="tag">SAVE</span><span className="tag">SDK</span><span className="tag">OPEN INTEGRATION</span></div>
            </div>
          </div>
        </section>

        {/* ═════════ SECTION 03: SAVINGS CALCULATOR ═══════════ */}
        <div className="layer-marker">
          <div className="lm-num">// SECTION_03</div>
          <div className="lm-title" style={{color:'var(--blue)'}}>SAVINGS CALCULATOR — SEE YOUR BENEFIT</div>
          <div className="lm-sep" />
          <div className="lm-tag">INTERACTIVE // LIVE // NO SIGNUP REQUIRED</div>
        </div>

        <div className="calc-section" id="demo">
          <div className="calc-container">
            <div className="calc-header">
              <h2>How much do you <span className="accent">save</span>?</h2>
              <p>Move the slider to see how SEEL reduces the collateral you need to lock up. The proof never reveals your income — only your eligibility tier.</p>
            </div>

            <div className="calc-slider-wrap">
              <div className="calc-slider-labels">
                <span>$1,000</span>
                <span style={{color:'var(--gold)', fontWeight:700, fontSize:'1.3rem'}}>${calcAmount.toLocaleString()} USDC</span>
                <span>$500,000</span>
              </div>
              <input
                className="calc-slider"
                type="range"
                min={1000}
                max={500000}
                step={1000}
                value={calcAmount}
                onChange={e => setCalcAmount(Number(e.target.value))}
              />
              <div className="calc-slider-hint">← drag to adjust borrow amount</div>
            </div>

            <div className="calc-bars">
              {/* Without SEEL */}
              <div className="calc-bar-row">
                <div className="calc-bar-meta">
                  <span className="calc-bar-label calc-bar-label--bad">WITHOUT SEEL</span>
                  <span className="calc-bar-ltv">65% LTV</span>
                </div>
                <div className="calc-bar-track">
                  <div className="calc-bar-fill calc-bar-fill--bad" style={{width:'100%'}} />
                </div>
                <div className="calc-bar-val calc-bar-val--bad">
                  ${calcCollateral(calcAmount, 65).toLocaleString()}
                  <span className="calc-bar-sub">collateral needed</span>
                </div>
              </div>

              {/* Tier 1 */}
              {(() => {
                const pct = calcCollateral(calcAmount,75) / calcCollateral(calcAmount,65) * 100;
                return (
                  <div className="calc-bar-row">
                    <div className="calc-bar-meta">
                      <span className="calc-bar-label calc-bar-label--mid">TIER 1 — ≥$2k/mo</span>
                      <span className="calc-bar-ltv">75% LTV</span>
                    </div>
                    <div className="calc-bar-track">
                      <div className="calc-bar-fill calc-bar-fill--mid" style={{width:`${pct.toFixed(1)}%`}} />
                    </div>
                    <div className="calc-bar-val calc-bar-val--mid">
                      ${calcCollateral(calcAmount, 75).toLocaleString()}
                      <span className="calc-bar-sub">collateral needed</span>
                    </div>
                  </div>
                );
              })()}

              {/* Tier 2 */}
              {(() => {
                const pct = calcCollateral(calcAmount,80) / calcCollateral(calcAmount,65) * 100;
                return (
                  <div className="calc-bar-row">
                    <div className="calc-bar-meta">
                      <span className="calc-bar-label calc-bar-label--good">TIER 2 — ≥$5k/mo</span>
                      <span className="calc-bar-ltv">80% LTV</span>
                    </div>
                    <div className="calc-bar-track">
                      <div className="calc-bar-fill calc-bar-fill--good" style={{width:`${pct.toFixed(1)}%`}} />
                    </div>
                    <div className="calc-bar-val calc-bar-val--good">
                      ${calcCollateral(calcAmount, 80).toLocaleString()}
                      <span className="calc-bar-sub">collateral needed</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="calc-savings-banner">
              <div className="csb-label">UNLOCK WITH SEEL TIER 2</div>
              <div className="csb-amount">${(calcCollateral(calcAmount, 65) - calcCollateral(calcAmount, 80)).toLocaleString()}</div>
              <div className="csb-sub">less collateral locked — same borrow, more capital free</div>
            </div>
          </div>
        </div>

        {/* ═════════ SECTION 04: TIERS ═════════════════════════ */}
        <div className="layer-marker">
          <div className="lm-num">// SECTION_04</div>
          <div className="lm-title" style={{color:'var(--gold)'}}>ATTESTATION TIERS — INCOME BANDS</div>
          <div className="lm-sep" />
          <div className="lm-tag">SOULBOUND // 30-DAY // AUTO-EXPIRE</div>
        </div>

        <section className="section" id="tiers">
          <div className="sec-hdr">
            <div className="sec-tag">ATTESTATION</div>
            <h2 className="sec-title">INCOME TIERS — YOUR PROOF. YOUR POWER.</h2>
          </div>
          <div className="tier-grid">
            <div className="tier-card reveal">
              <div className="tier-badge" style={{color:'var(--mint)',borderColor:'var(--border-mint)'}}>TIER 1</div>
              <div className="tier-amount">&gt;$2,000<span className="tier-period">/mo</span></div>
              <div className="tier-label">STANDARD QUALIFIER</div>
              <div className="tier-divider" />
              <div className="tier-stat"><span className="ts-label">LTV UNLOCK</span><span className="ts-value" style={{color:'var(--mint)'}}>75%</span></div>
              <div className="tier-stat"><span className="ts-label">VALIDITY</span><span className="ts-value">30 DAYS</span></div>
              <div className="tier-stat"><span className="ts-label">ATTESTATION FEE</span><span className="ts-value" style={{color:'var(--gold)'}}>$3–5 USDC</span></div>
              <div className="tier-stat"><span className="ts-label">RENEWAL</span><span className="ts-value">MONTHLY</span></div>
              <div className="tier-req">REQUIRES: 6+ months continuous income above threshold, recurring payment pattern, verified income source</div>
            </div>
            <div className="tier-card tier-gold reveal reveal-delay-1">
              <div className="tier-badge" style={{color:'var(--gold)',borderColor:'var(--border-gold)'}}>TIER 2</div>
              <div className="tier-amount" style={{color:'var(--gold)'}}>&gt;$5,000<span className="tier-period">/mo</span></div>
              <div className="tier-label">PREMIUM QUALIFIER</div>
              <div className="tier-divider" style={{background:'rgba(200,152,40,.2)'}} />
              <div className="tier-stat"><span className="ts-label">LTV UNLOCK</span><span className="ts-value" style={{color:'var(--mint)'}}>80%</span></div>
              <div className="tier-stat"><span className="ts-label">VALIDITY</span><span className="ts-value">30 DAYS</span></div>
              <div className="tier-stat"><span className="ts-label">ATTESTATION FEE</span><span className="ts-value" style={{color:'var(--gold)'}}>$5–8 USDC</span></div>
              <div className="tier-stat"><span className="ts-label">RENEWAL</span><span className="ts-value">MONTHLY</span></div>
              <div className="tier-req">REQUIRES: 6+ months continuous income above threshold, recurring payment pattern, verified income source</div>
            </div>
            <div className="tier-card reveal reveal-delay-2">
              <div className="tier-badge" style={{color:'var(--blue)',borderColor:'rgba(91,156,246,0.35)'}}>TOKEN PROPERTIES</div>
              <div className="tier-prop"><span className="tp-label">TYPE</span><span className="tp-val">Soulbound (Non-transferable)</span></div>
              <div className="tier-prop"><span className="tp-label">STANDARD</span><span className="tp-val">SPL Token-2022</span></div>
              <div className="tier-prop"><span className="tp-label">CHAIN</span><span className="tp-val">Solana</span></div>
              <div className="tier-prop"><span className="tp-label">EXPIRY</span><span className="tp-val">30 days, auto-expire</span></div>
              <div className="tier-prop"><span className="tp-label">ON-CHAIN DATA</span><span className="tp-val">Income band only</span></div>
              <div className="tier-prop"><span className="tp-label">NAME / EMPLOYER</span><span className="tp-val" style={{color:'var(--mint)'}}>NOT STORED</span></div>
              <div className="tier-prop"><span className="tp-label">EXACT INCOME</span><span className="tp-val" style={{color:'var(--mint)'}}>NOT STORED</span></div>
              <div className="tier-prop"><span className="tp-label">IDENTITY</span><span className="tp-val" style={{color:'var(--mint)'}}>ZERO EXPOSURE</span></div>
            </div>
          </div>
        </section>

        {/* ═════════ SECTION 05: TECH ══════════════════════════ */}
        <div className="layer-marker">
          <div className="lm-num">// SECTION_05</div>
          <div className="lm-title" style={{color:'var(--blue)'}}>TECH ARCHITECTURE — ZK + SOLANA</div>
          <div className="lm-sep" />
          <div className="lm-tag">CIRCOM // SNARKJS // ANCHOR // SPL TOKEN-2022</div>
        </div>

        <section className="section" id="tech">
          <div className="sec-hdr">
            <div className="sec-tag">ARCHITECTURE</div>
            <h2 className="sec-title">BUILT ON ZERO-KNOWLEDGE PROOFS</h2>
          </div>
          <div className="tgrid">
            <div className="twin reveal">
              <div className="tbar"><span className="tbar-txt">ZK.CIRCUIT // CIRCOM / SNARKJS</span><div className="wbtns"><div className="wb"/><div className="wb"/><div className="wb"/></div></div>
              <div className="tbody">
                <div><span className="tp">&gt;</span> <span className="tv">circuit</span> income_proof {'{'}</div>
                <div>&nbsp;&nbsp;<span className="tc">{'// private: raw income data'}</span></div>
                <div>&nbsp;&nbsp;<span className="tw">assert</span>(months &gt;= <span className="ts">6</span>)</div>
                <div>&nbsp;&nbsp;<span className="tw">assert</span>(avg_income &gt;= threshold)</div>
                <div>&nbsp;&nbsp;<span className="tw">assert</span>(is_recurring == <span className="ts">true</span>)</div>
                <div>&nbsp;&nbsp;<span className="tc">{'// public: boolean only'}</span></div>
                <div>&nbsp;&nbsp;<span className="ts">return</span> qualified: <span className="tv">bool</span></div>
                <div>{'}'}</div><br />
                <div className="prog"><div className="plbl"><span>PROOF SIZE</span><span>SMALL</span></div><div className="ptrack"><div className="pfill" style={{width:'95%',background:'var(--mint)'}}/></div></div>
                <div className="prog"><div className="plbl"><span>VERIFY TIME</span><span>1–3 SEC</span></div><div className="ptrack"><div className="pfill" style={{width:'82%',background:'var(--blue)'}}/></div></div>
                <div className="prog"><div className="plbl"><span>DATA LEAKED</span><span>ZERO</span></div><div className="ptrack"><div className="pfill" style={{width:'0%',background:'var(--red)'}}/></div></div>
              </div>
            </div>
            <div className="twin reveal reveal-delay-1">
              <div className="tbar"><span className="tbar-txt">ANCHOR.PROGRAM // SOLANA</span><div className="wbtns"><div className="wb"/><div className="wb"/><div className="wb"/></div></div>
              <div className="tbody">
                <div><span className="tp">&gt;</span> <span className="tv">pub fn</span> verify_and_mint(</div>
                <div>&nbsp;&nbsp;ctx: Context&lt;MintAttestation&gt;,</div>
                <div>&nbsp;&nbsp;proof: ZkProof,</div>
                <div>&nbsp;&nbsp;tier: IncomeTier,</div>
                <div>) {'{'}</div>
                <div>&nbsp;&nbsp;<span className="tc">{'// verify ZK proof on-chain'}</span></div>
                <div>&nbsp;&nbsp;<span className="tw">verify_proof</span>(&amp;proof)?;</div>
                <div>&nbsp;&nbsp;<span className="tc">{'// mint soulbound attestation'}</span></div>
                <div>&nbsp;&nbsp;<span className="ts">mint_soulbound</span>(ctx, tier)?;</div>
                <div>{'}'}</div><br />
                <div className="prog"><div className="plbl"><span>SPL TOKEN-2022</span><span>ACTIVE</span></div><div className="ptrack"><div className="pfill" style={{width:'100%',background:'var(--mint)'}}/></div></div>
                <div className="prog"><div className="plbl"><span>NON-TRANSFERABLE</span><span>ENFORCED</span></div><div className="ptrack"><div className="pfill" style={{width:'100%',background:'var(--gold)'}}/></div></div>
                <div className="prog"><div className="plbl"><span>AUTO EXPIRY</span><span>30 DAYS</span></div><div className="ptrack"><div className="pfill" style={{width:'100%',background:'var(--blue)'}}/></div></div>
              </div>
            </div>
            <div className="twin reveal reveal-delay-2">
              <div className="tbar"><span className="tbar-txt">INCOME.SOURCES // OAUTH</span><div className="wbtns"><div className="wb"/><div className="wb"/><div className="wb"/></div></div>
              <div className="tbody">
                <div><span className="tp">&gt;</span> <span className="ts">PLAID</span>.connect()</div>
                <div><span className="tc">{'// 6,000+ banks supported'}</span></div>
                <div><span className="tc">{'// bank statements, salary'}</span></div><br />
                <div><span className="tp">&gt;</span> <span className="ts">ARGYLE</span>.connect()</div>
                <div><span className="tc">{'// Gusto / Rippling / ADP'}</span></div>
                <div><span className="tc">{'// payroll direct integration'}</span></div><br />
                <div><span className="tp">&gt;</span> <span className="ts">STRIPE</span>.connect()</div>
                <div><span className="tc">{'// freelancer income streams'}</span></div>
                <div><span className="tc">{'// recurring payment history'}</span></div><br />
                <div className="prog"><div className="plbl"><span>DATA TO SERVER</span><span>ZERO</span></div><div className="ptrack"><div className="pfill" style={{width:'0%',background:'var(--red)'}}/></div></div>
                <div className="prog"><div className="plbl"><span>CLIENT-SIDE ONLY</span><span>100%</span></div><div className="ptrack"><div className="pfill" style={{width:'100%',background:'var(--mint)'}}/></div></div>
              </div>
            </div>
          </div>
        </section>

        {/* ═════════ SECTION 06: COMPARE ═══════════════════════ */}
        <div className="layer-marker">
          <div className="lm-num">// SECTION_06</div>
          <div className="lm-title" style={{color:'var(--mint)'}}>COMPETITIVE LANDSCAPE</div>
          <div className="lm-sep" />
          <div className="lm-tag">SEEL vs SAS vs CREDIBLE vs MAPLE vs GOLDFINCH</div>
        </div>

        <section className="section" id="compare">
          <div className="sec-hdr">
            <div className="sec-tag">LANDSCAPE</div>
            <h2 className="sec-title">WHERE SEEL WINS</h2>
          </div>
          <div className="comp-table-wrap reveal">
            <table className="comp-table">
              <thead>
                <tr>
                  <th>FEATURE</th>
                  <th className="seel-col">SEEL</th>
                  <th>SAS</th>
                  <th>CREDIBLE FINANCE</th>
                  <th>MAPLE / GOLDFINCH</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Income Verification</td><td className="seel-col yes">✓ TradFi income</td><td className="no">✕ Identity only</td><td className="no">✕ On-chain only</td><td className="no">✕ Institutional</td></tr>
                <tr><td>Zero-Knowledge Proof</td><td className="seel-col yes">✓ ZKP native</td><td className="no">✕</td><td className="no">✕</td><td className="no">✕</td></tr>
                <tr><td>Privacy-Preserving</td><td className="seel-col yes">✓ Zero PII on-chain</td><td className="no">✕ Identity disclosed</td><td className="partial">~ Pseudonymous</td><td className="no">✕ KYC required</td></tr>
                <tr><td>Individual Users</td><td className="seel-col yes">✓ Core target</td><td className="yes">✓</td><td className="yes">✓</td><td className="no">✕ Institutional only</td></tr>
                <tr><td>Higher LTV Unlocked</td><td className="seel-col yes">✓ Up to 80%</td><td className="no">✕ Standard terms</td><td className="partial">~ Score-based</td><td className="no">✕ Institutional</td></tr>
                <tr><td>Solana Native</td><td className="seel-col yes">✓ Anchor + SPL</td><td className="no">✕ Multi-chain</td><td className="no">✕</td><td className="no">✕ EVM</td></tr>
                <tr><td>Off-Chain Real Income</td><td className="seel-col yes">✓ Plaid (+ more soon)</td><td className="no">✕</td><td className="no">✕</td><td className="no">✕</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ═════════ SECTION 07: REVENUE ═══════════════════════ */}
        <div className="layer-marker">
          <div className="lm-num">// SECTION_07</div>
          <div className="lm-title" style={{color:'var(--gold)'}}>REVENUE MODEL — CHAINLINK FEE PATTERN</div>
          <div className="lm-sep" />
          <div className="lm-tag">ON-CHAIN PRIMITIVE // USAGE-BASED // PROTOCOL TREASURY</div>
        </div>

        <section className="section" id="revenue">
          <div className="sec-hdr">
            <div className="sec-tag">BUSINESS MODEL</div>
            <h2 className="sec-title">VALUE-ALIGNED REVENUE</h2>
          </div>
          <div className="rev-grid">
            <div className="rev-card reveal">
              <div className="rev-num">01</div>
              <div className="rev-icon">[ ATTESTATION.FEE ]</div>
              <div className="rev-title">PER-PROOF FEE</div>
              <div className="rev-amount">$3–8 USDC</div>
              <p className="rev-desc">Every proof generation pays into the protocol treasury. Users pay once per month for 30-day attestation access. Auto-renewal creates predictable recurring revenue. No subscription. Pay when you borrow.</p>
            </div>
            <div className="rev-card reveal reveal-delay-1">
              <div className="rev-num">02</div>
              <div className="rev-icon">[ PROTOCOL.LICENSE ]</div>
              <div className="rev-title">INTEGRATION LICENSE</div>
              <div className="rev-amount">B2B</div>
              <p className="rev-desc">Lending protocols integrating SEEL attestations pay annual fees or per-facilitation commissions. SDK distribution model — similar to Chainlink oracle fees. Value flows to protocols that adopt SEEL.</p>
            </div>
            <div className="rev-card reveal reveal-delay-2">
              <div className="rev-num">03</div>
              <div className="rev-icon">[ PREMIUM.TIER ]</div>
              <div className="rev-title">PREMIUM ACCESS</div>
              <div className="rev-amount">ENTERPRISE</div>
              <p className="rev-desc">Higher income thresholds, extended validity periods, institutional use cases, and white-label attestation for DeFi platforms. Custom ZK circuit parameters for specific protocol requirements.</p>
            </div>
          </div>
        </section>

        {/* ═════════ SECTION 08: LAUNCH ════════════════════════ */}
        <LaunchSection />

        {/* ═════════ FOOTER ════════════════════════════════════ */}
        <footer>
          <div className="fi">
            <div>
              <div className="fbrand">SEEL PROTOCOL</div>
              <div className="ftag">
                Zero-Knowledge Credit on Solana<br />
                Prove your income. Borrow more. Stay private.<br />
                <span style={{color:'var(--mint)'}}>ZKP // SPL TOKEN-2022 // ANCHOR PROGRAM</span>
              </div>
            </div>
            <ul className="flinks">
              <li><a href="#">↗ GITHUB</a></li>
              <li><a href="https://x.com/seelprotocol" target="_blank" rel="noopener noreferrer">↗ TWITTER</a></li>
            </ul>
          </div>
          <div className="fbot">
            <span className="fcopy">© 2025 SEEL PROTOCOL // ZK-CREDIT ON SOLANA</span>
            <span className="fsys">UPTIME: <span ref={uptimeRef}>00:00:00</span></span>
          </div>
        </footer>

      </div>
    </>
  );
}
