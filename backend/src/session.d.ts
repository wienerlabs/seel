import "express-session";

declare module "express-session" {
  interface SessionData {
    isPaymentConfirmed?: boolean;
    paymentId?: string;
    verifiedTier?: number;            // set by /proof/verify, consumed by /solana/mint
    groth16Proof?: string;            // JSON string of snarkjs proof object
    groth16PublicSignals?: string;    // JSON string of publicSignals array
  }
}
