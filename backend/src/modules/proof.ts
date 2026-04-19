/// <reference path="../session.d.ts" />
import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import { BarretenbergBackend } from "@noir-lang/backend_barretenberg";

const CIRCUIT_PATH = path.resolve(
  __dirname,
  "../../../frontend/public/circuits/income_proof.json"
);

// Cache the backend instance — initialising Barretenberg WASM is expensive.
let _backend: BarretenbergBackend | null = null;
async function getBackend(): Promise<BarretenbergBackend> {
  if (!_backend) {
    const circuit = JSON.parse(fs.readFileSync(CIRCUIT_PATH, "utf-8"));
    _backend = new BarretenbergBackend(circuit, { threads: 1 });
  }
  return _backend;
}

const router = Router();

// POST /proof/verify
// Receives a Noir UltraPlonk proof generated in the browser, verifies it with
// Barretenberg on the server, and stores the verified tier in the session for
// /solana/mint.
//
// Body: { proof: string (base64), publicInputs: string[] (hex field elements) }
// Income figures never reach the server — only the proof and public outputs do.
router.post("/verify", async (req: Request, res: Response) => {
  const { proof, publicInputs } = req.body as {
    proof: string;
    publicInputs: string[];
  };

  if (typeof proof !== "string" || !Array.isArray(publicInputs)) {
    return res.status(400).json({ error: "proof (base64) and publicInputs (string[]) are required" });
  }

  try {
    const backend = await getBackend();

    const isValid = await backend.verifyProof({
      proof: Buffer.from(proof, "base64"),
      publicInputs,
    });

    if (!isValid) {
      return res.status(400).json({ error: "Invalid proof" });
    }

    // The circuit has a single public return value: tier (u8).
    // Noir encodes it as a 32-byte field element, e.g. "0x0000...0001" or "0x0000...0002".
    const tier = parseInt(publicInputs[0], 16);
    if (tier !== 1 && tier !== 2) {
      return res.status(400).json({ error: "Proof does not meet minimum income tier" });
    }

    req.session.verifiedTier = tier;
    res.json({ valid: true, tier });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[proof/verify] failed:", msg.slice(0, 200));
    res.status(500).json({ error: "Proof verification failed" });
  }
});

export default router;
