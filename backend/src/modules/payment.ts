/// <reference path="../session.d.ts" />
import { Request, Response, NextFunction, RequestHandler } from "express";
import { verify, settle } from "x402/verify";
import { processPriceToAtomicAmount } from "x402/shared";

const NETWORK = "solana-devnet" as const;
const PRICE = "$0.01";
const X402_VERSION = 1;
// Coinbase x402 facilitator fee-payer on Solana devnet
const FEE_PAYER = "CKPKJWNdJEqa81x7CkZ14BVPiY6y16Sxs7owznqtWYp5";

/**
 * Builds an x402 PaymentRequirements object for the given resource URL.
 */
function buildRequirements(resource: string, payTo: string) {
  const result = processPriceToAtomicAmount(PRICE, NETWORK);
  if ("error" in result) throw new Error(result.error);
  const { maxAmountRequired, asset } = result;

  // x402 PaymentRequirementsSchema expects `asset` as a plain address string,
  // but getDefaultAsset() returns an object { address, decimals, eip712 }.
  // Extract the address so the facilitator schema validation passes.
  const assetAddress = typeof asset === "object" && asset !== null
    ? (asset as { address: string }).address
    : asset as string;

  return {
    x402Version: X402_VERSION,
    scheme: "exact",
    network: NETWORK,
    maxAmountRequired,
    resource,
    description: "SEEL income attestation - prove your income, keep your privacy",
    mimeType: "application/json",
    payTo,
    maxTimeoutSeconds: 300,
    asset: assetAddress,
    extra: { feePayer: FEE_PAYER },
  };
}

/**
 * Express middleware that enforces x402 payment on the protected route.
 *
 * Usage in index.ts:
 *   import { x402PaymentMiddleware } from "./modules/payment";
 *   app.post("/solana/mint", x402PaymentMiddleware, mintHandler);
 *
 * Flow:
 *  1. No X-PAYMENT header → 402 + X-ACCEPTS-PAYMENT header with requirements
 *  2. Header present → verify via Coinbase facilitator
 *  3. Valid → settle on-chain → attach X-PAYMENT-RESPONSE → next()
 */
export function x402PaymentMiddleware(
  payTo: string = process.env.BACKEND_WALLET_ADDRESS ||
    "9ddEUKvHDdfpM5ijAa7KJ1xzGPX5PPMmsdenSDfVrxSN"
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const paymentHeader = req.headers["x-payment"] as string | undefined;

    // Construct the resource URL (used as payment intent identifier)
    const host = req.get("host") || "localhost:3001";
    const resource = `${req.protocol}://${host}${req.originalUrl}`;
    const requirements = buildRequirements(resource, payTo);

    // ── Step 1: No payment header → return 402 ──────────────────────────
    if (!paymentHeader) {
      const accepts = JSON.stringify([requirements]);
      res
        .status(402)
        .setHeader("X-ACCEPTS-PAYMENT", accepts)
        .json({ error: "Payment required", accepts: [requirements] });
      return;
    }

    // ── Step 2: Decode X-PAYMENT header ─────────────────────────────────
    let payload: any;
    try {
      const decoded = Buffer.from(paymentHeader, "base64").toString("utf8");
      payload = JSON.parse(decoded);
    } catch {
      res.status(400).json({ error: "Malformed X-PAYMENT header" });
      return;
    }

    // ── Step 3: Verify with x402 facilitator ────────────────────────────
    let verifyResult: Awaited<ReturnType<typeof verify>>;
    try {
      verifyResult = await verify(payload, requirements as any);
    } catch (err: any) {
      res.status(502).json({ error: "Facilitator verify error", detail: err?.message });
      return;
    }

    if (!verifyResult.isValid) {
      console.error("[x402] verify failed:", verifyResult.invalidReason, JSON.stringify(payload));
      res.status(402).json({
        error: "Invalid payment",
        reason: verifyResult.invalidReason,
      });
      return;
    }

    // ── Step 4: Settle on-chain via facilitator ──────────────────────────
    let settleResult: Awaited<ReturnType<typeof settle>>;
    try {
      settleResult = await settle(payload, requirements as any);
    } catch (err: any) {
      res.status(502).json({ error: "Facilitator settle error", detail: err?.message });
      return;
    }

    if (!settleResult.success) {
      res.status(402).json({
        error: "Payment settlement failed",
        reason: settleResult.errorReason,
      });
      return;
    }

    // Mark payment confirmed in session so the mint route can verify it
    req.session.isPaymentConfirmed = true;

    res.setHeader("X-PAYMENT-RESPONSE", JSON.stringify(settleResult));
    (req as any).x402Settlement = settleResult;

    next();
  };
}

// Default middleware instance (uses BACKEND_WALLET_ADDRESS from env)
export default x402PaymentMiddleware();
