import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import WalletContextProvider from "@/components/WalletContextProvider";

export const metadata: Metadata = {
  title: "SEEL Protocol",
  icons: { icon: "/logo.ico" },
  description:
    "SEEL is a Solana-based DeFi lending protocol. Prove your real-world income with Zero-Knowledge Proofs and unlock higher LTV ratios — without revealing a single byte of personal data.",
  keywords: "SEEL, Solana, DeFi, ZKP, Zero-Knowledge Proof, lending, income verification, SPL Token, Soulbound Token",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {/* Preload Plaid script as a real <script> tag so Plaid's findScriptTag()
            can locate it in document.scripts regardless of component mount order. */}
        <Script
          src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"
          strategy="beforeInteractive"
        />
        <WalletContextProvider>{children}</WalletContextProvider>
      </body>
    </html>
  );
}
