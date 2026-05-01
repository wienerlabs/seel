"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

export interface AccessCreds {
  provider: "plaid" | "demo";
  token: string;
  demoMonthlyAmounts?: number[];
}

const DEMO_SCENARIOS = [
  {
    label: "$5,000 / mo",
    sublabel: "Tier 2 — 85% LTV",
    amounts: [5000, 5000, 5000, 5000, 5000, 5000],
    tier: "TIER 2",
    tierColor: "#4ade80",
  },
  {
    label: "$2,000 / mo",
    sublabel: "Tier 1 — 80% LTV",
    amounts: [2000, 2000, 2000, 2000, 2000, 2000],
    tier: "TIER 1",
    tierColor: "#facc15",
  },
  {
    label: "$1,500 / mo",
    sublabel: "Below threshold",
    amounts: [1500, 1500, 1500, 1500, 1500, 1500],
    tier: "NO TIER",
    tierColor: "#f87171",
  },
];

// Isolated sub-component so usePlaidLink (and Plaid's CDN script) only mounts
// when a real link_token exists, avoiding the "Failed to find script" SSR race.
function PlaidButton({
  token,
  onSuccess,
}: {
  token: string;
  onSuccess: (publicToken: string) => void;
}) {
  const { open, ready } = usePlaidLink({ token, onSuccess });
  return (
    <button
      onClick={() => open()}
      disabled={!ready}
      className="px-6 py-3 rounded-xl font-semibold text-sm bg-seel-green text-black
                 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
    >
      Connect Bank (Plaid)
    </button>
  );
}

interface Props {
  onConnected: (creds: AccessCreds) => void;
}

export default function OAuthConnect({ onConnected }: Props) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [demoStatus, setDemoStatus] = useState<"idle" | "loading" | "done">("idle");

  useEffect(() => {
    setStatus("loading");
    fetch(`${BACKEND}/auth/plaid/link-token`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setLinkToken(d.link_token ?? null);
        setStatus(d.link_token ? "idle" : "error");
      })
      .catch(() => setStatus("error"));
  }, []);

  const onPlaidSuccess = useCallback(
    async (publicToken: string) => {
      setStatus("loading");
      try {
        const res = await fetch(`${BACKEND}/auth/plaid/callback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ public_token: publicToken }),
        });
        const data = await res.json();
        if (res.ok && data.access_token) {
          setStatus("done");
          onConnected({ provider: "plaid", token: data.access_token });
        } else {
          setStatus("error");
        }
      } catch {
        setStatus("error");
      }
    },
    [onConnected],
  );

  const handleDemoScenario = useCallback((scenario: typeof DEMO_SCENARIOS[number]) => {
    setDemoStatus("loading");
    setTimeout(() => {
      setDemoStatus("done");
      onConnected({ provider: "demo", token: "", demoMonthlyAmounts: scenario.amounts });
    }, 200);
  }, [onConnected]);

  const isDone = status === "done" || demoStatus === "done";

  return (
    <div className="flex flex-col items-center gap-5">
      <p className="text-gray-400 text-sm text-center">
        Connect your bank account to verify income.
        <br />
        <span className="text-gray-500 text-xs">
          Income computation and ZK proof generation happen in your browser. Raw financial data transits our backend as a read-only proxy and is never stored.
        </span>
      </p>

      {/* Only mount PlaidButton when we have a real token — prevents
          Plaid's link-initialize.js "Failed to find script" race on SSR. */}
      {linkToken && !isDone ? (
        <PlaidButton token={linkToken} onSuccess={onPlaidSuccess} />
      ) : (
        <button
          disabled
          className="px-6 py-3 rounded-xl font-semibold text-sm bg-seel-green text-black
                     hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isDone ? "Bank connected" : "Connecting…"}
        </button>
      )}

      {status === "error" && (
        <p className="text-red-400 text-xs">
          Could not connect to Plaid. Check your backend environment variables.
        </p>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
        <span style={{ fontSize: 11, color: "#555", letterSpacing: "0.1em" }}>OR</span>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.08)" }} />
      </div>

      <div style={{ width: "100%" }}>
        <p style={{ fontSize: 11, color: "#555", letterSpacing: "0.1em", marginBottom: 10, textAlign: "center" }}>
          DEMO — NO PLAID ACCOUNT NEEDED
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {DEMO_SCENARIOS.map((scenario) => (
            <button
              key={scenario.label}
              onClick={() => handleDemoScenario(scenario)}
              disabled={demoStatus === "loading" || isDone}
              style={{
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${scenario.tierColor}33`,
                borderRadius: 10,
                padding: "10px 14px",
                cursor: demoStatus === "loading" || isDone ? "not-allowed" : "pointer",
                opacity: demoStatus === "loading" || isDone ? 0.4 : 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                transition: "background 0.15s",
              }}
              onMouseEnter={e => {
                if (!(demoStatus === "loading" || isDone))
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.07)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)";
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: "#e5e5e5" }}>{scenario.label}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, color: scenario.tierColor, fontWeight: 600, letterSpacing: "0.06em" }}>
                  {scenario.tier}
                </span>
                <span style={{ fontSize: 10, color: "#555" }}>{scenario.sublabel}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
