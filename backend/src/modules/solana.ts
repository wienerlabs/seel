import { Router, Request, Response } from "express";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { AnchorProvider, Program, Wallet, setProvider, Idl } from "@coral-xyz/anchor";
import fs from "fs";
import path from "path";

const IDL_PATH = path.resolve(__dirname, "../../../target/idl/seel.json");

// Token program public keys
const TOKEN_2022_PROGRAM_ID    = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const SPL_TOKEN_PROGRAM_ID     = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
// Correct ATA program address — the "...LJe1bSW" variant does NOT exist on devnet
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

/** Derives the associated token account address for Token-2022. */
function getAta(owner: PublicKey, mint: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_2022_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return ata;
}

const connection = new Connection(
  process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
  "confirmed"
);

function loadAuthorityKeypair(): Keypair {
  const kpPath =
    process.env.BACKEND_KEYPAIR_PATH ||
    `${process.env.HOME}/.config/solana/devnet-keypair.json`;

  if (fs.existsSync(kpPath)) {
    const raw = JSON.parse(fs.readFileSync(kpPath, "utf-8")) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  }

  console.warn("Keypair not found — using ephemeral keypair (devnet only)");
  return Keypair.generate();
}

const authorityKp = loadAuthorityKeypair();

function getProgram(): Program {
  if (!fs.existsSync(IDL_PATH)) {
    throw new Error(
      "IDL not found — run: anchor build  (from the repo root)"
    );
  }

  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf-8")) as Idl;
  const wallet = new Wallet(authorityKp);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  setProvider(provider);

  // Anchor 0.30: Program() takes (idl, provider) — programId comes from idl.address
  return new Program(idl, provider);
}

/**
 * Mints (or renews) an attestation token for `userPubkey`.
 *
 * Noir proof is verified by the backend (Barretenberg); the Anchor program is
 * built with --features verify-skip so it accepts any proof bytes and reads
 * the tier directly from public_values[0].
 */
export async function mintAttestationToken(
  userPubkey: string,
  tier: number,
): Promise<string> {
  const proofBytes = Buffer.alloc(32);           // dummy — verify-skip ignores it
  const publicValuesBytes = Buffer.from([tier]); // tier byte read by Anchor program
  const program = getProgram();
  const user = new PublicKey(userPubkey);

  // ATA for the user's soulbound Token-2022 badge — cannot be auto-resolved by Anchor
  const [soulboundMint] = PublicKey.findProgramAddressSync(
    [Buffer.from("soulbound_mint"), user.toBuffer()],
    program.programId
  );
  const soulboundTokenAccount = getAta(user, soulboundMint);

  // Use Anchor's high-level methods builder (camelCase method name).
  // Anchor 0.30 auto-resolves PDAs and named program IDs from the IDL;
  // we only need to supply the accounts that can't be derived automatically.
  const ix = await (program.methods as any)
    .mintAttestation(proofBytes, publicValuesBytes)
    .accounts({
      user,
      authority: authorityKp.publicKey,
      soulboundTokenAccount,
    })
    .instruction();

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: authorityKp.publicKey });
  // Mint + ATA creation CPIs need ~600K CU.
  tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }));
  tx.add(ix);
  tx.sign(authorityKp);

  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );
  return sig;
}

/**
 * Scans all attestation accounts and closes any that have expired.
 * Called by the daily cron job.
 */
export async function checkExpiredTokens(): Promise<void> {
  if (!fs.existsSync(IDL_PATH)) {
    console.log("IDL not found — skipping expired-token sweep");
    return;
  }

  const program = getProgram();
  const now = Math.floor(Date.now() / 1000);
  const accounts = await connection.getProgramAccounts(program.programId);

  for (const { pubkey, account } of accounts) {
    try {
      const decoded = (program.coder.accounts as any).decode(
        "AttestationAccount",
        account.data
      );
      if (decoded.expiresAt.toNumber() >= now) continue;

      await (program.methods as any)
        .expireAttestation()
        .accounts({ attestation: pubkey, user: decoded.owner })
        .rpc();

      console.log(`Closed expired attestation: ${pubkey.toBase58()}`);
    } catch {
      // Account may already be closed or have unexpected data — skip
    }
  }
}

// ---------------------------------------------------------------------------
// USDC ATA Initialization
// ---------------------------------------------------------------------------

const DEVNET_USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

/** Derives ATA address without @solana/spl-token (CJS compat). */
function getAtaAddress(owner: PublicKey, mint: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), SPL_TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return ata;
}

/** Builds createAssociatedTokenAccount instruction without @solana/spl-token. */
function buildCreateAtaInstruction(
  payer: PublicKey,
  ata: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer,                   isSigner: true,  isWritable: true  },
      { pubkey: ata,                     isSigner: false, isWritable: true  },
      { pubkey: owner,                   isSigner: false, isWritable: false },
      { pubkey: mint,                    isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID,    isSigner: false, isWritable: false },
    ],
    data: Buffer.alloc(0),
  });
}

/**
 * Ensures the payment receiver has a USDC ATA on devnet.
 * Called once on startup — x402 simulation fails if the ATA doesn't exist.
 */
export async function ensureReceiverUsdcAta(receiverAddress: string): Promise<void> {
  try {
    const receiver = new PublicKey(receiverAddress);
    const ata = getAtaAddress(receiver, DEVNET_USDC_MINT);

    const existing = await connection.getAccountInfo(ata);
    if (existing) {
      console.log(`[SEEL] Receiver USDC ATA exists: ${ata.toBase58()}`);
      return;
    }

    console.log(`[SEEL] Creating receiver USDC ATA: ${ata.toBase58()} …`);

    // Ensure payer (authority) has SOL for rent
    const payerBalance = await connection.getBalance(authorityKp.publicKey);
    if (payerBalance < 5_000_000) {
      console.log("[SEEL] Airdropping SOL to authority for ATA creation…");
      const airdropSig = await connection.requestAirdrop(authorityKp.publicKey, 1_000_000_000);
      await connection.confirmTransaction(airdropSig, "confirmed");
    }

    const { blockhash } = await connection.getLatestBlockhash();
    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: authorityKp.publicKey });
    tx.add(buildCreateAtaInstruction(authorityKp.publicKey, ata, receiver, DEVNET_USDC_MINT));
    tx.sign(authorityKp);

    const txSig = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(txSig, "confirmed");
    console.log(`[SEEL] Receiver USDC ATA created: ${txSig}`);
  } catch (err) {
    console.warn("[SEEL] Could not ensure receiver USDC ATA:", (err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

const router = Router();

// POST /solana/mint
// Gate 1: x402 payment must have been settled (isPaymentConfirmed set by middleware).
// Gate 2: tier comes from the session set by /proof/verify — never from the request
//         body — to prevent tier escalation attacks.
router.post("/mint", async (req: Request, res: Response) => {
  if (!req.session.isPaymentConfirmed) {
    return res.status(403).json({ error: "Payment not confirmed" });
  }

  const tier = req.session.verifiedTier;

  if (!tier) {
    return res.status(403).json({ error: "No verified proof in session — call /proof/verify first" });
  }

  const { userPubkey } = req.body as { userPubkey?: string };

  if (!userPubkey) {
    return res.status(400).json({ error: "userPubkey is required" });
  }

  try {
    const signature = await mintAttestationToken(userPubkey, tier);
    // Consume one-use session flags
    req.session.isPaymentConfirmed = false;
    req.session.verifiedTier = undefined;
    res.json({ success: true, signature });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[solana/mint] mintAttestationToken failed:", msg);
    res.status(500).json({ error: "Minting failed", reason: msg.slice(0, 300) });
  }
});

export default router;
