"use client";

import { useEffect, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  ComputeBudgetProgram,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import type { AccessCreds } from "./OAuthConnect";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
const TIER_LABELS: Record<number, string> = {
  1: "Tier 1 — ≥$2 000/month",
  2: "Tier 2 — ≥$5 000/month",
};

type Step =
  | "idle"
  | "fetching_income"
  | "generating_proof"
  | "verifying_proof"
  | "signing_payment"
  | "minting"
  | "done"
  | "error";

interface Props {
  onProofReady: (proof: string, tier: number, signature: string) => void;
  accessCreds: AccessCreds;
}

// ---------------------------------------------------------------------------
// Client-side income computation helpers
// All computation stays in the browser — the backend is a transparent relay.
// ---------------------------------------------------------------------------

interface PlaidTx { amount: number; date: string; name: string }

function computeMonthlyFromPlaid(transactions: PlaidTx[]): number[] {
  const now = new Date();
  const monthly = new Array(6).fill(0);
  for (const tx of transactions) {
    if (tx.amount >= 0) continue; // Plaid: positive = debit, negative = credit/income
    const d = new Date(tx.date);
    const m =
      (now.getFullYear() - d.getFullYear()) * 12 +
      (now.getMonth() - d.getMonth());
    if (m >= 0 && m < 6) monthly[5 - m] += Math.abs(tx.amount);
  }
  return monthly.map((v) => Math.round(v));
}

async function fetchIncomeClientSide(creds: AccessCreds): Promise<number[]> {
  if (creds.provider === "demo") {
    if (!creds.demoMonthlyAmounts) throw new Error("No demo amounts provided");
    return creds.demoMonthlyAmounts;
  }

  if (creds.provider === "plaid") {
    const res = await fetch(`${BACKEND}/income/plaid-transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ access_token: creds.token }),
    });
    if (!res.ok) throw new Error("Failed to fetch Plaid transactions");
    const { transactions } = (await res.json()) as { transactions: PlaidTx[] };
    const credits = transactions.filter((t) => t.amount < 0);
    console.log(`[SEEL] Plaid: ${transactions.length} total tx, ${credits.length} credits (income)`);
    return computeMonthlyFromPlaid(transactions);
  }

  throw new Error(`Unknown provider: ${creds.provider}`);
}

// ---------------------------------------------------------------------------
// Browser-side Circom Groth16 proof generation (snarkjs)
// Income figures never leave the browser — only the proof is sent to backend.
// ---------------------------------------------------------------------------

async function generateGroth16Proof(
  monthly_amounts: number[],
  threshold: number,
): Promise<{ proof: object; publicSignals: string[] }> {
  // Dynamic import — snarkjs WASM is large, only load when needed.
  const { groth16 } = await import("snarkjs");

  const input = {
    monthly_amounts: monthly_amounts.map(String),
    threshold: String(threshold),
  };

  // fullProve: computes witness + proof in one call, entirely in the browser.
  const { proof, publicSignals } = await groth16.fullProve(
    input,
    "/circuits/income_proof.wasm",
    "/circuits/income_proof_final.zkey",
  );

  return { proof, publicSignals };
}

// ---------------------------------------------------------------------------

export default function ProofGenerator({ onProofReady, accessCreds }: Props) {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [step, setStep] = useState<Step>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [incomeTooLow, setIncomeTooLow] = useState(false);
  const [monthlyDebug, setMonthlyDebug] = useState<number[] | null>(null);
  const [feeLabel, setFeeLabel] = useState("$3");

  // Eagerly load snarkjs and circuit files so they're browser-cached before the user clicks.
  useEffect(() => {
    import("snarkjs").catch(() => {});
    fetch("/circuits/income_proof.wasm").catch(() => {});
    fetch("/circuits/income_proof_final.zkey").catch(() => {});
  }, []);

  async function run() {
    if (!publicKey) return;
    setErrorMsg("");
    setIncomeTooLow(false);

    const creds = accessCreds;

    try {
      // 1. Fetch income data from provider proxy, compute monthly averages in browser.
      setStep("fetching_income");
      const monthly_amounts = await fetchIncomeClientSide(creds);
      setMonthlyDebug(monthly_amounts);
      console.log("[SEEL] monthly_amounts:", monthly_amounts);

      // 2. Pre-check tier before spending prove time.
      const zeroMonthCount = monthly_amounts.filter(m => m <= 0).length;
      if (zeroMonthCount > 0) {
        throw new Error(
          `${zeroMonthCount} month${zeroMonthCount > 1 ? 's have' : ' has'} $0 income. The ZK circuit requires all 6 months to be positive.`,
        );
      }

      const average = monthly_amounts.reduce((a, b) => a + b, 0) / 6;
      const tier = average >= 5000 ? 2 : average >= 2000 ? 1 : 0;
      if (tier === 0) {
        setIncomeTooLow(true);
        throw new Error(
          `6-month average $${Math.round(average).toLocaleString()}/mo is below the $2,000 minimum.`,
        );
      }
      const threshold = tier === 2 ? 5000 : 2000;

      // 3. Generate Groth16 proof entirely in the browser via snarkjs.
      //    Income figures never leave the client — only the proof is sent to the server.
      setStep("generating_proof");
      const { proof, publicSignals } = await generateGroth16Proof(monthly_amounts, threshold);
      console.log("[SEEL] proof generated, publicSignals:", publicSignals);

      // 4. Send proof to backend for snarkjs server-side verification.
      setStep("verifying_proof");
      const verifyRes = await fetch(`${BACKEND}/proof/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ proof, publicSignals }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.valid) {
        throw new Error(verifyData.error || "Proof verification failed");
      }
      const circuitTier: number = verifyData.tier;

      // 5. First call to /solana/mint — expect 402 with x402 payment requirements.
      setStep("signing_payment");
      const mintUrl = `${BACKEND}/solana/mint`;
      const mintBody = JSON.stringify({ userPubkey: publicKey.toBase58() });

      const firstAttempt = await fetch(mintUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: mintBody,
      });

      if (firstAttempt.status !== 402) {
        throw new Error(`Expected 402 from mint endpoint, got ${firstAttempt.status}`);
      }

      const acceptsHeader = firstAttempt.headers.get("X-ACCEPTS-PAYMENT");
      if (!acceptsHeader) throw new Error("Missing X-ACCEPTS-PAYMENT header");
      const [requirements] = JSON.parse(acceptsHeader);

      // 6. Build USDC transfer tx.
      const usdcMint = new PublicKey(requirements.asset as string);
      const facilitator = new PublicKey(requirements.extra.feePayer);
      const receiverPk = new PublicKey(requirements.payTo);
      const amount = BigInt(requirements.maxAmountRequired);

      // Update fee label from server-reported amount (6 decimals → UI dollars).
      const feeUsd = (Number(amount) / 1_000_000).toFixed(2).replace(/\.?0+$/, "");
      setFeeLabel(`$${feeUsd}`);

      const fromAta = await getAssociatedTokenAddress(usdcMint, publicKey);
      const toAta = await getAssociatedTokenAddress(usdcMint, receiverPk);

      const balanceResp = await connection.getTokenAccountBalance(fromAta).catch(() => null);
      if (!balanceResp) {
        throw new Error(
          `USDC token account not found. Make sure your wallet has USDC and try again.`
        );
      }
      const usdcBalance = BigInt(balanceResp.value.amount);
      if (usdcBalance < amount) {
        throw new Error(
          `Insufficient USDC: wallet has ${balanceResp.value.uiAmountString} USDC, need ${feeLabel}.`
        );
      }

      const { blockhash } = await connection.getLatestBlockhash();

      // Build as versioned (v0) transaction — x402.org uses @solana/kit which
      // decodes v0 natively. Legacy transactions get converted and lose the user's
      // signature (sigVerify: true would fail on simulate).
      const message = new TransactionMessage({
        payerKey: facilitator,
        recentBlockhash: blockhash,
        instructions: [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 }),
          createTransferCheckedInstruction(fromAta, usdcMint, toAta, publicKey, amount, 6),
        ],
      }).compileToV0Message();

      const versionedTx = new VersionedTransaction(message);

      if (!signTransaction) throw new Error("Wallet does not support signTransaction");
      const signedTx = await signTransaction(versionedTx);

      const base64Tx = Buffer.from(signedTx.serialize()).toString("base64");

      // 7. Retry /solana/mint with x402 payment header.
      setStep("minting");
      const paymentPayload = {
        x402Version: requirements.x402Version,
        scheme: "exact",
        network: "solana-devnet",
        payload: { transaction: base64Tx },
      };
      const xPaymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");

      const mintRes = await fetch(mintUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-PAYMENT": xPaymentHeader,
        },
        credentials: "include",
        body: mintBody,
      });
      if (!mintRes.ok) {
        const err = await mintRes.json().catch(() => ({}));
        const reason = (err as any)?.reason ? ` (${(err as any).reason})` : "";
        throw new Error(((err as any)?.error || "Minting failed") + reason);
      }
      const mintData = await mintRes.json();

      setStep("done");
      onProofReady("", circuitTier, mintData.signature);
    } catch (err: any) {
      setErrorMsg(err?.message || "Unknown error");
      setStep("error");
    }
  }

  const statusLabel: Record<Step, string> = {
    idle: "Generate Proof & Claim Token",
    fetching_income: "Fetching income data…",
    generating_proof: "Generating ZK proof in browser…",
    verifying_proof: "Verifying proof…",
    signing_payment: `Sign ${feeLabel} USDC payment in wallet…`,
    minting: "Minting attestation token…",
    done: "Done!",
    error: "Try again",
  };

  const busy = !["idle", "done", "error"].includes(step);

  return (
    <div className="flex flex-col items-center gap-5">
      <p className="text-gray-400 text-sm text-center">
        Income computation and ZK proof generation happen entirely in your browser. Raw financial data transits our backend as a read-only proxy and is never stored.
        <br />
        A one-time {feeLabel} USDC fee covers the on-chain attestation.
      </p>

      <button
        onClick={() => run()}
        disabled={busy || step === "done"}
        className="w-full px-6 py-3 rounded-xl font-semibold text-sm bg-seel-purple text-white
                   hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {statusLabel[step]}
      </button>

      {busy && (
        <div className="flex items-center gap-2 text-gray-400 text-xs">
          <svg
            className="animate-spin"
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="7" cy="7" r="5.5" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
            <path
              d="M7 1.5A5.5 5.5 0 0 1 12.5 7"
              stroke="#8B5CF6"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          {statusLabel[step]}
          {step === "generating_proof" && (
            <span className="text-gray-600"> (~10s)</span>
          )}
        </div>
      )}

      {step === "error" && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-red-400 text-xs text-center">{errorMsg}</p>
          {incomeTooLow && monthlyDebug && (
            <div style={{
              width: "100%",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
              padding: "10px 14px",
              fontFamily: "monospace",
              fontSize: 11,
              color: "#888",
            }}>
              <div style={{ marginBottom: 6, color: "#555", letterSpacing: "0.08em" }}>
                {accessCreds.provider.toUpperCase()} — MONTHLY INCOME (last 6 months)
              </div>
              {monthlyDebug.map((amt, i) => {
                const d = new Date();
                d.setMonth(d.getMonth() - (5 - i));
                const label = d.toLocaleString("en-US", { month: "short", year: "2-digit" });
                return (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{label}</span>
                    <span style={{ color: amt >= 2000 ? "#4ade80" : "#f87171" }}>
                      ${amt.toLocaleString()}
                    </span>
                  </div>
                );
              })}
              <div style={{
                marginTop: 6,
                paddingTop: 6,
                borderTop: "1px solid rgba(255,255,255,0.06)",
                display: "flex",
                justifyContent: "space-between",
                color: "#aaa",
              }}>
                <span>AVG</span>
                <span>${Math.round(monthlyDebug.reduce((a, b) => a + b, 0) / 6).toLocaleString()}/mo</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
