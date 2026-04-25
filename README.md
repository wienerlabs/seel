# SEEL

**Privacy-preserving income attestation on Solana — prove your real-world income with client-side ZK proofs and unlock higher LTV borrowing on DeFi, without revealing any financial data.**

---

## How It Works

1. User connects to Plaid via OAuth — income data stays in the browser
2. A Circom Groth16 ZK circuit runs locally and answers: *"Is my 6-month average income above the threshold?"*
3. The proof (no names, no exact figures, no employer) is sent to the backend for verification
4. User pays a small USDC attestation fee via x402
5. A Soulbound SPL Token-2022 is minted on Solana — valid for 30 days, non-transferable
6. Lending protocols (Kamino, Save) read the token and unlock a higher LTV

Raw income data never leaves the client.

---

## Architecture

```
Browser
  ├── OAuth (Plaid)                income data stays client-side
  └── Circom Groth16 (snarkjs)     ZK proof generated locally

Backend (Node.js + TypeScript, port 3001)
  ├── /auth      OAuth callback, session token
  ├── /income    Plaid income data (never forwarded to logs)
  ├── /proof     snarkjs Groth16 proof verification
  ├── /payment   x402 USDC attestation fee
  └── /solana    Anchor program interaction, token minting

Solana (devnet)
  ├── Anchor Program   verify Groth16 proof (BN254), mint/expire/revoke attestation
  └── SPL Token-2022   Soulbound (NonTransferable) attestation token
```

---

## Income Tiers

| Tier | Monthly Average (6-month floor) | LTV |
|------|--------------------------------|-----|
| 1    | >= $2,000                       | 75% |
| 2    | >= $5,000                       | 80% |

The circuit checks all 6 months have positive income and computes the floor average. The threshold is a private input — the verifier only sees the resulting tier.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| ZK Circuit | Circom 2.0 + snarkJS (Groth16, BN254) |
| Solana Program | Rust, Anchor 0.30, SPL Token-2022 |
| Backend | Node.js 18+, TypeScript, Express |
| Frontend | Next.js 14, Tailwind CSS |
| Wallet | Solana Wallet Adapter (Phantom, Solflare) |
| Income APIs | Plaid |
| Payment | x402 (USDC micropayment) |
| DeFi | Kamino SDK |

---

## Project Structure

```
seel/
├── circuits/
│   └── income_proof_circom/   Circom circuit + trusted setup artifacts
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
- circom + snarkJS (for circuit setup)

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
npm install
npm run dev
```

### Anchor Program

```bash
anchor build                              # production build
anchor build --features verify-skip      # local testing only — never deploy
anchor deploy --provider.cluster devnet
```

> Never build for production with `--features verify-skip`.

### Circom Circuit

```bash
cd circuits/income_proof_circom
npm run setup   # compile, trusted setup, export verification key
# artifacts land in frontend/public/circuits/ automatically
```

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
| `BACKEND_WALLET_ADDRESS` | Solana address to receive attestation fees |

---

## Deployed Addresses (Devnet)

| Resource | Value |
|----------|-------|
| Program ID | `DwiHe1VWW9KXeWXJFaRFoMNzPt3mVs2Ac84gPbaeBkoJ` |
| USDC Mint | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |

---

## Privacy Guarantees

- Income figures are private circuit inputs — they never leave the browser
- The server receives a proof and public outputs only (tier: 1 or 2)
- API responses containing income data are never logged on the server
- The on-chain token stores only tier, timestamps, and a proof hash
