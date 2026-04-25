/// <reference path="../session.d.ts" />
/// <reference path="../snarkjs.d.ts" />
import { Router, Request, Response } from "express";
import path from "path";
import fs from "fs";
import { groth16 } from "snarkjs";

const VK_PATH = path.resolve(
  __dirname,
  "../../../circuits/income_proof_circom/verification_key.json"
);

let _vk: object | null = null;
function getVk(): object {
  if (!_vk) {
    if (!fs.existsSync(VK_PATH)) {
      throw new Error(
        "verification_key.json not found — run: cd circuits/income_proof_circom && npm run setup"
      );
    }
    _vk = JSON.parse(fs.readFileSync(VK_PATH, "utf-8"));
  }
  return _vk!;
}

const router = Router();

// POST /proof/verify
// Receives a snarkjs Groth16 proof generated in the browser, verifies it with
// snarkjs on the server, and stores the verified tier + proof in the session
// for /solana/mint.
//
// Body: { proof: object (snarkjs proof), publicSignals: string[] }
// Income figures never reach the server — only the proof and public output do.
router.post("/verify", async (req: Request, res: Response) => {
  const { proof, publicSignals } = req.body as {
    proof: object;
    publicSignals: string[];
  };

  if (!proof || !publicSignals || !Array.isArray(publicSignals)) {
    return res.status(400).json({ error: "proof (object) and publicSignals (string[]) are required" });
  }

  try {
    const vk = getVk();
    const isValid = await groth16.verify(vk, publicSignals, proof);

    if (!isValid) {
      return res.status(400).json({ error: "Invalid proof" });
    }

    // snarkjs encodes public signals as decimal strings, e.g. "1" or "2"
    const tier = Number(publicSignals[0]);
    if (tier !== 1 && tier !== 2) {
      return res.status(400).json({ error: "Proof does not meet minimum income tier" });
    }

    req.session.verifiedTier = tier;
    req.session.groth16Proof = JSON.stringify(proof);
    req.session.groth16PublicSignals = JSON.stringify(publicSignals);

    res.json({ valid: true, tier });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[proof/verify] failed:", msg.slice(0, 200));
    res.status(500).json({ error: "Proof verification failed" });
  }
});

export default router;
