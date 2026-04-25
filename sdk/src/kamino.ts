import { Connection, PublicKey } from "@solana/web3.js";
import { createSolanaRpc } from "@solana/rpc";
import {
  KaminoMarket,
  VanillaObligation,
  PROGRAM_ID as KAMINO_PROGRAM_ID,
} from "@kamino-finance/klend-sdk";
import type { Address } from "@solana/addresses";
import { getAttestation, getRecommendedLtv } from "./index";
import { SeelBorrowAnalysis } from "./types";

// Kamino mainnet main market
const KAMINO_MAIN_MARKET = "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF" as Address;

// Slot duration in ms — Solana mainnet ~400ms, devnet ~500ms
const RECENT_SLOT_DURATION_MS = 400;

/**
 * Analyzes Kamino borrow capacity with and without SEEL attestation.
 * Accepts web3.js v1 Connection/PublicKey (Wallet Adapter types) and bridges
 * to the @solana/kit Rpc that Kamino SDK v7 requires internally.
 */
export async function getSeelBorrowAnalysis(
  connection: Connection,
  walletPubkey: PublicKey,
  seelProgramId: PublicKey,
  marketAddress: string = KAMINO_MAIN_MARKET
): Promise<SeelBorrowAnalysis> {
  // 1. SEEL attestation (uses web3.js v1 Connection directly)
  const att = await getAttestation(connection, walletPubkey, seelProgramId);
  const now = Math.floor(Date.now() / 1000);
  const hasSeel = att !== null && att.expiresAt > now;
  const seelLtv = await getRecommendedLtv(connection, walletPubkey, seelProgramId);

  // 2. Build a @solana/kit Rpc from the connection's RPC endpoint
  const rpcUrl = (connection as any).rpcEndpoint as string;
  const rpc = createSolanaRpc(rpcUrl as any);

  // 3. Load Kamino market — may fail on devnet (mainnet market address not present)
  let market: KaminoMarket | null = null;
  try {
    market = await KaminoMarket.load(
      rpc as any,
      marketAddress as Address,
      RECENT_SLOT_DURATION_MS,
      KAMINO_PROGRAM_ID,
      true
    );
  } catch {
    return buildDemoAnalysis(hasSeel, att, seelLtv);
  }

  if (!market) {
    return buildDemoAnalysis(hasSeel, att, seelLtv);
  }

  // 4. Load user obligation (vanilla = standard lending, no leverage)
  const walletAddress = walletPubkey.toBase58() as Address;
  const obligationType = new VanillaObligation(KAMINO_PROGRAM_ID);
  const obligation = await market.getObligationByWallet(walletAddress, obligationType);

  let collateralValueUsd = 0;
  let currentBorrowedUsd = 0;
  let baseLtv = 65;

  if (obligation) {
    const deposits = obligation.getDeposits();
    const borrows = obligation.getBorrows();

    collateralValueUsd = deposits.reduce(
      (sum, d) => sum + (d as any).marketValueRefreshed.toNumber(),
      0
    );
    currentBorrowedUsd = borrows.reduce(
      (sum, b) => sum + (b as any).marketValueRefreshed.toNumber(),
      0
    );

    // Use obligation's own maxLtv if available, otherwise fall back to reserve config
    const stats = (obligation as any).refreshedStats;
    if (stats?.maxLtv) {
      baseLtv = stats.maxLtv.toNumber() * 100;
    } else if (deposits.length > 0) {
      const reserve = market.getReserveByMint((deposits[0] as any).mintAddress);
      const reserveLtv = (reserve as any)?.stats?.loanToValuePct;
      if (typeof reserveLtv === "number") baseLtv = reserveLtv;
    }
  }

  const baseBorrowLimitUsd = collateralValueUsd * (baseLtv / 100);
  const seelBorrowLimitUsd = collateralValueUsd * (seelLtv / 100);

  return {
    hasSeel,
    tier: hasSeel ? (att!.tier ?? null) : null,
    attestationExpiresAt: hasSeel ? att!.expiresAt : null,
    collateralValueUsd,
    baseLtv,
    seelLtv,
    baseBorrowLimitUsd,
    seelBorrowLimitUsd,
    currentBorrowedUsd,
    additionalBorrowWithSeel: Math.max(0, seelBorrowLimitUsd - baseBorrowLimitUsd),
  };
}

/** Demo fallback when Kamino market is unreachable (devnet / wrong cluster) */
function buildDemoAnalysis(
  hasSeel: boolean,
  att: { tier: number; expiresAt: number } | null,
  seelLtv: number
): SeelBorrowAnalysis {
  const baseLtv = 65;
  return {
    hasSeel,
    tier: hasSeel ? (att!.tier ?? null) : null,
    attestationExpiresAt: hasSeel ? att!.expiresAt : null,
    collateralValueUsd: 0,
    baseLtv,
    seelLtv,
    baseBorrowLimitUsd: 0,
    seelBorrowLimitUsd: 0,
    currentBorrowedUsd: 0,
    additionalBorrowWithSeel: 0,
    isDemo: true,
  };
}
