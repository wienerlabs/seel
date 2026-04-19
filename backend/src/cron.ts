import "dotenv/config";
import cron from "node-cron";
import { checkExpiredTokens } from "./modules/solana";

// Run every day at 02:00 AM server time
cron.schedule("0 2 * * *", async () => {
  console.log("[cron] Starting expired-attestation sweep…");
  try {
    await checkExpiredTokens();
    console.log("[cron] Sweep complete.");
  } catch {
    console.error("[cron] Sweep error (details suppressed).");
  }
});

console.log("[cron] Scheduler started — sweep runs daily at 02:00.");
