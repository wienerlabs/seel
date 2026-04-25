export interface SeelBorrowAnalysis {
  hasSeel: boolean;
  tier: number | null;
  attestationExpiresAt: number | null;

  collateralValueUsd: number;

  baseLtv: number;
  seelLtv: number;
  baseBorrowLimitUsd: number;
  seelBorrowLimitUsd: number;

  currentBorrowedUsd: number;
  additionalBorrowWithSeel: number;

  /** True when Kamino market couldn't be loaded (e.g. devnet) — values use simulated collateral */
  isDemo?: boolean;
}
