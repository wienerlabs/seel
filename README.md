# SEEL

**Prove your real-world income on Solana. Borrow more without revealing it.**

SEEL is a Solana-based DeFi protocol that lets users anonymously prove their traditional finance income using client-side Zero-Knowledge Proofs. A verified proof mints a Soulbound attestation token on-chain, which lending protocols accept to offer higher LTV ratios (65% to 80%).

---

## How It Works

1. User connects to Plaid via OAuth — income data stays in the browser
2. A Noir ZK circuit runs locally and answers: *"Is my 6-month average income above the threshold?"*
3. The proof (no names, no exact figures, no employer) is sent to the backend for verification
4. User pays a $3–8 USDC attestation fee via x402
5. A Soulbound SPL Token-2022 is minted on Solana — valid for 30 days, non-transferable
6. Lending protocols (Kamino, Save) read the token and unlock a higher LTV

Raw income data never leaves the client.

---

## Architecture

```
Browser
  ├── OAuth (Plaid / Argyle / Stripe)   income data stays client-side
  └── Noir circuit (WASM)               generates ZK proof locally

Backend (Node.js + TypeScript)
  ├── /auth      OAuth callback, session token
  ├── /payment   x402 USDC fee ($3-8)
  ├── /proof     Barretenberg proof verification
  └── /solana    Anchor program interaction, token minting

Solana
  ├── Anchor Program   verify proof, mint/expire/revoke attestation
  └── SPL Token-2022   Soulbound (NonTransferable) attestation token
```

---

## Income Tiers

| Tier | Monthly Average | LTV |
|------|----------------|-----|
| 1    | >= $2,000       | 75% |
| 2    | >= $5,000       | 80% |

The circuit checks all 6 months have positive income and computes the floor average. The threshold is a private input — the verifier only sees the resulting tier.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| ZK Circuit | Noir 0.36 + Barretenberg (UltraPlonk) |
| Solana Program | Rust, Anchor 0.30, SPL Token-2022 |
| Backend | Node.js 18+, TypeScript, Express |
| Frontend | Next.js 14, Tailwind CSS |
| Wallet | Solana Wallet Adapter (Phantom, Solflare) |
| Income APIs | Plaid, Argyle, Stripe |
| Payment | x402 (USDC micropayment) |
| DeFi | Kamino SDK, Save SDK |

---

## Project Structure

```
seel/
├── circuits/
│   ├── income_proof/          Noir circuit (threshold check)
│   └── income_proof_sp1/      SP1 circuit (Groth16, on-chain verification)
├── programs/seel/             Anchor program (Rust)
├── backend/                   Node.js API
├── frontend/                  Next.js app
└── sdk/                       Integration SDK for lending protocols
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Rust + Anchor CLI 0.30
- Solana CLI (devnet)
- Nargo CLI 0.36 (for Noir circuit)

### Backend

```bash
cd backend
cp .env.example .env   # fill in your credentials
npm install
npm run dev
```

### Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

### Anchor Program

```bash
anchor build --features verify-skip   # local testing only
anchor deploy --provider.cluster devnet
```

> Never build for production with `--features verify-skip`.

---

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in:

| Variable | Description |
|----------|-------------|
| `PLAID_CLIENT_ID` | Plaid API client ID |
| `PLAID_SECRET` | Plaid API secret |
| `PLAID_ENV` | `sandbox` or `production` |
| `SESSION_SECRET` | Express session secret (random string) |
| `SOLANA_RPC_URL` | Solana RPC endpoint |
| `SEEL_PROGRAM_ID` | Deployed Anchor program address |
| `USDC_MINT` | USDC mint address (devnet or mainnet) |
| `BACKEND_KEYPAIR_PATH` | Path to Solana keypair file |
| `NETWORK_PRIVATE_KEY` | SP1 prover network key |

---

## Program ID (Devnet)

```
DwiHe1VWW9KXeWXJFaRFoMNzPt3mVs2Ac84gPbaeBkoJ
```

---

## Revenue Model

| Source | Detail |
|--------|--------|
| Attestation Fee | $3–8 USDC per proof, monthly |
| Protocol License | Annual or per-transaction fee from lending protocols |
| Premium Tier | Higher thresholds, longer validity, enterprise use |

---

## Privacy Guarantees

- Income figures are private circuit inputs — they never leave the browser
- The server receives a proof and public outputs only (tier: 1 or 2)
- API responses are never logged on the server
- The on-chain token stores only tier, timestamps, and a proof hash
