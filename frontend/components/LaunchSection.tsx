'use client';

export default function LaunchSection() {
  return (
    <>
      <div className="layer-marker">
        <div className="lm-num">// SECTION_08</div>
        <div className="lm-title" style={{ color: 'var(--mint)' }}>LAUNCH — INCOME ATTESTATION</div>
        <div className="lm-sep" />
        <div className="lm-tag">DEMO</div>
      </div>

      <section className="section" id="launch">
        <div className="sec-hdr">
          <div className="sec-tag">LAUNCH</div>
          <h2 className="sec-title">UNLOCK YOUR BORROWING POWER</h2>
        </div>

        <div className="lsec-box reveal">
          {/* ── Left: main content ── */}
          <div className="lsec-main">
            <div className="launch-title">
              CONNECT YOUR INCOME.<br />PROVE IT. BORROW MORE.
            </div>
            <p className="launch-sub">
              Connect a verified income source in under 5 minutes. Generate your ZK proof
              entirely in the browser. Receive your Soulbound attestation on Solana.
              Access DeFi lending at better LTV ratios — without exposing a single byte
              of personal data.
            </p>

            <div className="launch-flow">
              <div className="lf-step"><span className="lf-n">1</span>Connect Plaid Income Source</div>
              <div className="lf-arrow">→</div>
              <div className="lf-step"><span className="lf-n">2</span>Generate ZK Proof in browser</div>
              <div className="lf-arrow">→</div>
              <div className="lf-step"><span className="lf-n">3</span>Mint attestation on Solana</div>
              <div className="lf-arrow">→</div>
              <div className="lf-step"><span className="lf-n">4</span>Borrow at higher LTV</div>
            </div>

            <div className="cta-row" style={{ marginTop: 28 }}>
              <a href="/launch" className="btn btn-primary">▶ GET ATTESTATION</a>
              <a href="#" className="btn btn-ghost"   style={{ marginLeft: '-1px' }}>↗ GITHUB</a>
            </div>
          </div>

          {/* ── Right: stats + token preview ── */}
          <div className="lsec-right">
            <div className="lsec-live">
              <span className="lsec-live-dot" />
              LIVE&nbsp;·&nbsp;SOLANA DEVNET
            </div>
            <div className="lsec-divider" />

            <div className="ls-item">
              <div className="ls-val" style={{ color: 'var(--mint)' }}>~5 min</div>
              <div className="ls-label">To First Attestation</div>
            </div>
            <div className="ls-item">
              <div className="ls-val" style={{ color: 'var(--gold)' }}>1–3s</div>
              <div className="ls-label">Proof Generation</div>
            </div>
            <div className="ls-item">
              <div className="ls-val">6,000+</div>
              <div className="ls-label">Banks Supported</div>
            </div>
            <div className="ls-item">
              <div className="ls-val" style={{ color: 'var(--red)' }}>$0</div>
              <div className="ls-label">Identity Exposed</div>
            </div>

            <div className="lsec-divider" />

            {/* Mini attestation token preview */}
            <div className="lsec-token">
              <div className="lsec-token-hdr">◢ ATTESTATION TOKEN</div>
              <div className="lsec-token-row">
                <span>TYPE</span><span>SOULBOUND</span>
              </div>
              <div className="lsec-token-row">
                <span>STANDARD</span><span>SPL Token-2022</span>
              </div>
              <div className="lsec-token-row">
                <span>LTV UNLOCK</span>
                <span style={{ color: 'var(--gold)' }}>80%</span>
              </div>
              <div className="lsec-token-row">
                <span>VALIDITY</span><span>30 DAYS</span>
              </div>
              <div className="lsec-token-row">
                <span>TRANSFER</span>
                <span style={{ color: 'var(--text-muted)' }}>LOCKED</span>
              </div>
              <div className="lsec-token-row">
                <span>PII ON-CHAIN</span>
                <span style={{ color: 'var(--mint)' }}>ZERO</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Protocol integrations strip ── */}
        <div className="lsec-integrations reveal">
          <span className="lsec-int-label">INTEGRATED WITH</span>
          <div className="lsec-int-items">
            <div className="lsec-int-item">⬡ KAMINO FINANCE</div>
            <div className="lsec-int-item">◈ SAVE PROTOCOL</div>
            <div className="lsec-int-item">◎ SOLANA DEVNET</div>
            <div className="lsec-int-item">⬗ PLAID · ARGYLE · STRIPE</div>
          </div>
        </div>
      </section>
    </>
  );
}
