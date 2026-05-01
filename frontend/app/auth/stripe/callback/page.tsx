"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

function StripeCallbackInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    const code = searchParams.get("code");
    const err = searchParams.get("error_description") ?? searchParams.get("error");
    if (err) {
      setError(err);
      setStatus("error");
      return;
    }
    if (!code) {
      setError("No authorisation code returned from Stripe.");
      setStatus("error");
      return;
    }

    fetch(`${BACKEND}/auth/stripe/callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ code }),
    })
      .then((r) => r.json())
      .then((data: { access_token?: string; error?: string }) => {
        if (!data.access_token) throw new Error(data.error ?? "Exchange failed");
        sessionStorage.setItem("stripe_access_token", data.access_token);
        router.replace("/");
      })
      .catch((e: Error) => {
        setError(e.message);
        setStatus("error");
      });
  }, [searchParams, router]);

  if (status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <div className="text-center space-y-4">
          <p className="text-red-400">{error}</p>
          <button
            onClick={() => router.replace("/")}
            className="px-4 py-2 rounded-lg bg-white/10 text-sm hover:bg-white/20"
          >
            Back to home
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black text-white">
      <p className="text-gray-400 text-sm">Connecting Stripe…</p>
    </main>
  );
}

export default function StripeCallbackPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="text-gray-400 text-sm">Loading…</p>
      </main>
    }>
      <StripeCallbackInner />
    </Suspense>
  );
}
