import { Connection, PublicKey } from "@solana/web3.js";

export const ATTESTATION_SEED = Buffer.from("attestation");

export interface AttestationData {
  owner: PublicKey;
  issuer: PublicKey;
  tier: number;
  issuedAt: number;
  expiresAt: number;
  proofHash: Buffer;
  bump: number;
}

/**
 * Derives the attestation PDA for a given wallet.
 */
export function getAttestationPda(
  walletPubkey: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ATTESTATION_SEED, walletPubkey.toBuffer()],
    programId
  );
}

/**
 * Reads the on-chain AttestationAccount for `walletPubkey`.
 * Returns `null` if no attestation exists.
 */
export async function getAttestation(
  connection: Connection,
  walletPubkey: PublicKey,
  programId: PublicKey
): Promise<AttestationData | null> {
  const [pda] = getAttestationPda(walletPubkey, programId);
  const info = await connection.getAccountInfo(pda);
  if (!info) return null;

  // Manual deserialization (skip 8-byte Anchor discriminator)
  const buf = Buffer.from(info.data);
  let o = 8;

  const owner = new PublicKey(buf.slice(o, o + 32)); o += 32;
  const issuer = new PublicKey(buf.slice(o, o + 32)); o += 32;
  const tier = buf[o]; o += 1;
  const issuedAt = Number(buf.readBigInt64LE(o)); o += 8;
  const expiresAt = Number(buf.readBigInt64LE(o)); o += 8;
  const proofHash = buf.slice(o, o + 32); o += 32;
  const bump = buf[o];

  return { owner, issuer, tier, issuedAt, expiresAt, proofHash, bump };
}

/**
 * Returns `true` if the wallet has a non-expired attestation.
 */
export async function hasValidAttestation(
  connection: Connection,
  walletPubkey: PublicKey,
  programId: PublicKey
): Promise<boolean> {
  const att = await getAttestation(connection, walletPubkey, programId);
  if (!att) return false;
  return att.expiresAt > Math.floor(Date.now() / 1000);
}

/**
 * Returns the recommended LTV ratio for a borrower:
 *  - No attestation  → 65 %
 *  - Tier 1 (≥$2k)  → 75 %
 *  - Tier 2 (≥$5k)  → 80 %
 */
export async function getRecommendedLtv(
  connection: Connection,
  walletPubkey: PublicKey,
  programId: PublicKey
): Promise<number> {
  const att = await getAttestation(connection, walletPubkey, programId);
  if (!att) return 65;

  const now = Math.floor(Date.now() / 1000);
  if (att.expiresAt <= now) return 65;

  if (att.tier === 2) return 80;
  if (att.tier === 1) return 75;
  return 65;
}
