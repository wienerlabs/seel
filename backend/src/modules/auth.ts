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

// GET /auth/argyle/user-token
// Creates an Argyle user token used to initialise Argyle Link in the browser.
router.get("/argyle/user-token", async (_req: Request, res: Response) => {
  const auth = Buffer.from(
    `${process.env.ARGYLE_CLIENT_ID}:${process.env.ARGYLE_CLIENT_SECRET}`
  ).toString("base64");
  try {
    const r = await fetch("https://api.argyle.com/v2/user-tokens", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: "{}",
    });
    if (!r.ok) throw new Error(`Argyle ${r.status}`);
    const data = await r.json() as { user_token?: string };
    res.json({ user_token: data.user_token });
  } catch (err: any) {
    console.error("[Argyle] user-token:", err?.message);
    res.status(500).json({ error: "Failed to create Argyle user token" });
  }
});

// GET /auth/stripe/connect-url
// Returns the Stripe Connect OAuth URL for the user to authorise read-only access.
router.get("/stripe/connect-url", (_req: Request, res: Response) => {
  const clientId = process.env.STRIPE_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: "Stripe not configured" });
  const redirectUri = `${process.env.FRONTEND_URL}/auth/stripe/callback`;
  const url = new URL("https://connect.stripe.com/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", "read_only");
  url.searchParams.set("redirect_uri", redirectUri);
  res.json({ url: url.toString() });
});

// POST /auth/stripe/callback
// Exchanges the Stripe authorisation code for a connected-account access_token.
router.post("/stripe/callback", async (req: Request, res: Response) => {
  const { code } = req.body as { code?: string };
  if (!code) return res.status(400).json({ error: "code required" });
  try {
    const r = await fetch("https://connect.stripe.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_secret: process.env.STRIPE_SECRET_KEY!,
      }).toString(),
    });
    if (!r.ok) throw new Error(`Stripe ${r.status}`);
    const data = await r.json() as { access_token?: string };
    res.json({ access_token: data.access_token });
  } catch {
    res.status(500).json({ error: "Stripe token exchange failed" });
  }
});

export default router;
