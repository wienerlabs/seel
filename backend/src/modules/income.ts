/// <reference path="../session.d.ts" />
import { Router, Request, Response } from "express";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

const plaidEnv =
  (process.env.PLAID_ENV as keyof typeof PlaidEnvironments) ?? "sandbox";

const plaid = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments[plaidEnv],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID!,
        "PLAID-SECRET": process.env.PLAID_SECRET!,
      },
    },
  })
);

// Demo income: ~$5 000/month → Tier 2 qualifier
const DEMO_INCOME = [4850, 5120, 4980, 5300, 5050, 5200];

const router = Router();

// POST /income/mock
// Returns demo monthly_amounts — no Plaid account required.
// Disabled in production to prevent fake attestations.
router.post("/mock", (_req: Request, res: Response) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Demo mode is not available in production" });
  }
  res.json({ success: true, monthly_amounts: DEMO_INCOME });
});

// POST /income/plaid-transactions
// CORS proxy for Plaid Transactions API.
//
// The client provides its own access_token (returned by /auth/plaid/callback).
// This server does NOT compute, aggregate, or store income data — raw
// transactions are passed through to the browser for client-side computation.
router.post("/plaid-transactions", async (req: Request, res: Response) => {
  const { access_token } = req.body as { access_token?: string };
  if (!access_token) {
    return res.status(400).json({ error: "access_token required" });
  }

  const now = new Date();
  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const startDate = sixMonthsAgo.toISOString().slice(0, 10);
  const endDate = now.toISOString().slice(0, 10);

  try {
    const transactions: { amount: number; date: string; name: string }[] = [];
    let offset = 0;
    let fetched = 0;
    let total = Infinity;

    while (fetched < total) {
      const { data } = await plaid.transactionsGet({
        access_token,
        start_date: startDate,
        end_date: endDate,
        options: { count: 500, offset },
      });

      total = data.total_transactions;
      for (const tx of data.transactions) {
        // Pass raw fields only — client computes monthly averages
        transactions.push({ amount: tx.amount, date: tx.date, name: tx.name });
      }

      fetched += data.transactions.length;
      if (data.transactions.length === 0) break;
      offset += data.transactions.length;
    }

    res.json({ transactions, source: "plaid" });
  } catch {
    res.status(500).json({ error: "Failed to proxy Plaid transactions" });
  }
});

export default router;
