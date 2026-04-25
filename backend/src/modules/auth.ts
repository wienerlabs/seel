/// <reference path="../session.d.ts" />
import { Router, Request, Response } from "express";
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
} from "plaid";

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

// GET /auth/plaid/link-token
// Creates a Link token for Plaid Link. Uses Transactions product only —
// income is computed client-side from raw transactions (no income_verification
// product required, which avoids sandbox userCreate/user_token complexity).
router.get("/plaid/link-token", async (_req: Request, res: Response) => {
  try {
    const { data } = await plaid.linkTokenCreate({
      user: { client_user_id: `seel_${Date.now()}` },
      client_name: "SEEL Income Attestation",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
    });

    res.json({ link_token: data.link_token });
  } catch (err: any) {
    console.error("[Plaid] link-token error:", err?.response?.data ?? err?.message ?? err);
    res.status(500).json({ error: "Failed to create Plaid link token" });
  }
});

// POST /auth/plaid/callback
// Exchanges the public_token from Plaid Link for a persistent access_token.
// The access_token is returned to the client — income fetching happens
// client-side using this token so raw income data never reaches this server.
router.post("/plaid/callback", async (req: Request, res: Response) => {
  const { public_token } = req.body as { public_token?: string };
  if (!public_token) {
    return res.status(400).json({ error: "public_token is required" });
  }
  try {
    const { data } = await plaid.itemPublicTokenExchange({ public_token });
    // Returned to client over HTTPS — never logged.
    res.json({ success: true, access_token: data.access_token });
  } catch {
    res.status(500).json({ error: "Token exchange failed" });
  }
});

export default router;
