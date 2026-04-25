/// <reference path="./session.d.ts" />
import "dotenv/config";
import express from "express";
import session from "express-session";
import rateLimit from "express-rate-limit";
import authRouter from "./modules/auth";
import incomeRouter from "./modules/income";
import proofRouter from "./modules/proof";
import { x402PaymentMiddleware } from "./modules/payment";
import solanaRouter, { ensureReceiverUsdcAta } from "./modules/solana";

// Fix 6: crash early in production if SESSION_SECRET is not set
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret && process.env.NODE_ENV === "production") {
  throw new Error("SESSION_SECRET environment variable must be set in production");
}

const app = express();

app.use(express.json());
app.use(
  session({
    secret: sessionSecret || "seel-dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      // Fix 8: secure cookies in production; sameSite prevents CSRF
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "strict",
      maxAge: 3_600_000,
    },
  })
);

// CORS for local frontend dev
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.FRONTEND_URL || "http://localhost:3000");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-PAYMENT, X-PAYMENT-RESPONSE");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Expose-Headers", "X-ACCEPTS-PAYMENT, X-PAYMENT-RESPONSE");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// /proof/verify runs snarkjs Groth16 verification; cap tightly per IP
const proofLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many proof generation requests — try again later" },
});

// /auth/plaid/link-token creates a billable Plaid API call per request
const plaidLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many link-token requests — try again later" },
});

// General limiter for all other routes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — try again later" },
});

app.use(generalLimiter);
app.use("/proof/verify", proofLimiter);
app.use("/auth/plaid/link-token", plaidLimiter);

app.use("/auth", authRouter);
app.use("/income", incomeRouter);
app.use("/proof", proofRouter);

// x402 payment gate: POST /solana/mint requires $3 USDC on Solana devnet
app.post("/solana/mint", x402PaymentMiddleware());
app.use("/solana", solanaRouter);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, async () => {
  console.log(`SEEL backend listening on http://localhost:${PORT}`);
  const payTo = process.env.BACKEND_WALLET_ADDRESS || "9ddEUKvHDdfpM5ijAa7KJ1xzGPX5PPMmsdenSDfVrxSN";
  await ensureReceiverUsdcAta(payTo);
});

// SP1 Groth16 CPU proving can take 5-10 minutes — disable server-level timeouts
// so the connection is not dropped mid-proof.
server.timeout = 0;
server.keepAliveTimeout = 0;
