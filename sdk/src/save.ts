import { Connection, PublicKey } from "@solana/web3.js";
import {
  fetchObligationsOfPoolByWallet,
  formatObligation,
  getReservesOfPool,
  SOLEND_PRODUCTION_PROGRAM_ID,
  MAIN_POOL_ADDRESS,
} from "@solendprotocol/solend-sdk";
import { getAttestation, getRecommendedLtv } from "./index";
import { SeelBorrowAnalysis } from "./types";

/**
 * Analyzes Save Finance (formerly Solend) borrow capacity with and without SEEL attestation.
 *
 * Pipeline:
 *   getReservesOfPool   → reserve map (includes LTV ratios + prices via Pyth)
 *   fetchObligationsOfPoolByWallet → raw obligation
 *   formatObligation    → USD-denominated stats
 *
 * Falls back to a demo result on devnet or when the user has no position.
 */
export async function getSaveSeelBorrowAnalysis(
  connection: Connection,
  walletPubkey: PublicKey,
  seelProgramId: PublicKey,
  poolAddress: PublicKey = MAIN_POOL_ADDRESS,
  programId: PublicKey = SOLEND_PRODUCTION_PROGRAM_ID
): Promise<SeelBorrowAnalysis> {
  // 1. SEEL attestation
  const att = await getAttestation(connection, walletPubkey, seelProgramId);
  const now = Math.floor(Date.now() / 1000);
  const hasSeel = att !== null && att.expiresAt > now;
  const seelLtv = await getRecommendedLtv(connection, walletPubkey, seelProgramId);

  // 2. Load Save Finance reserves (Pyth prices included by default)
  let reserveMap: Record<string, any>;
  try {
    const currentSlot = await connection.getSlot();
    const reserves = await getReservesOfPool(
      poolAddress,
      connection,
      programId.toBase58(),
      currentSlot
    );
    reserveMap = Object.fromEntries(reserves.map((r: any) => [r.pubkey.toBase58(), r]));
  } catch {
    return buildDemoAnalysis(hasSeel, att, seelLtv);
  }

  // 3. Fetch raw obligation accounts for this wallet × pool
  let rawObligations: Awaited<ReturnType<typeof fetchObligationsOfPoolByWallet>>;
  try {
    rawObligations = await fetchObligationsOfPoolByWallet(
      walletPubkey,
      poolAddress,
      programId,
      connection
    );
  } catch {
    return buildDemoAnalysis(hasSeel, att, seelLtv);
  }

  if (!rawObligations.length) {
    return {
      hasSeel,
      tier: hasSeel ? (att!.tier ?? null) : null,
      attestationExpiresAt: hasSeel ? att!.expiresAt : null,
      collateralValueUsd: 0,
      baseLtv: 65,
      seelLtv,
      baseBorrowLimitUsd: 0,
      seelBorrowLimitUsd: 0,
      currentBorrowedUsd: 0,
      additionalBorrowWithSeel: 0,
    };
  }

  // 4. Format obligation → USD-denominated stats
  const formatted = formatObligation(rawObligations[0], reserveMap);

  const collateralValueUsd = formatted.totalSupplyValue.toNumber();
  const currentBorrowedUsd = formatted.totalBorrowValue.toNumber();
  const borrowLimitUsd = formatted.borrowLimit.toNumber();

  // Derive base LTV from obligation's own borrow limit relative to collateral
  let baseLtv = 65;
  if (collateralValueUsd > 0) {
    baseLtv = Math.round((borrowLimitUsd / collateralValueUsd) * 100);
  } else if (formatted.deposits.length > 0) {
    // Weighted LTV across deposit types when collateral has no price yet
    const totalAmt = formatted.deposits.reduce((s, d) => s + d.amountUsd.toNumber(), 0);
    if (totalAmt > 0) {
      baseLtv = Math.round(
        formatted.deposits.reduce((s, d) => s + d.loanToValueRatio * d.amountUsd.toNumber(), 0) /
          totalAmt
      );
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

function buildDemoAnalysis(
  hasSeel: boolean,
  att: { tier: number; expiresAt: number } | null,
  seelLtv: number
): SeelBorrowAnalysis {
  return {
    hasSeel,
    tier: hasSeel ? (att!.tier ?? null) : null,
    attestationExpiresAt: hasSeel ? att!.expiresAt : null,
    collateralValueUsd: 0,
    baseLtv: 65,
    seelLtv,
    baseBorrowLimitUsd: 0,
    seelBorrowLimitUsd: 0,
    currentBorrowedUsd: 0,
    additionalBorrowWithSeel: 0,
    isDemo: true,
  };
}
