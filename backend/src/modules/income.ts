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

const router = Router();

// POST /income/plaid-bank-income
// Fetches structured bank income via Plaid's income_verification product.
// Requires a user_token created during the Link session (via /auth/plaid/link-token).
// In sandbox, Plaid returns realistic test income data (>$2 000/mo).
router.post("/plaid-bank-income", async (req: Request, res: Response) => {
  const { user_token } = req.body as { user_token?: string };
  if (!user_token) {
    return res.status(400).json({ error: "user_token required" });
  }

  try {
    const { data } = await plaid.creditBankIncomeGet({ user_token });

    if (!data.bank_income?.length) {
      return res.status(404).json({ error: "No income data — ensure the Link session included income_verification" });
    }

    // Aggregate monthly income across all bank income reports → items → sources.
    const now = new Date();
    const monthly = new Array(6).fill(0);

    for (const report of data.bank_income) {
      for (const item of report.items ?? []) {
        for (const source of item.bank_income_sources ?? []) {
          for (const hs of source.historical_summary ?? []) {
            if (!hs.start_date) continue;
            const d = new Date(hs.start_date);
            const m = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
            if (m >= 0 && m < 6) monthly[5 - m] += hs.total_amount ?? 0;
          }
        }
      }
    }

    res.json({ monthly_amounts: monthly.map(Math.round), source: "plaid-bank-income" });
  } catch {
    res.status(500).json({ error: "Failed to fetch bank income" });
  }
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
