import "express-session";

declare module "express-session" {
  interface SessionData {
    isPaymentConfirmed?: boolean;
    paymentId?: string;
    verifiedTier?: number;  // set by /proof/verify, consumed by /solana/mint
  }
}
