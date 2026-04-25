"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useWallet } from "@solana/wallet-adapter-react";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

interface Props {
  onConnected: () => void;
}

export default function WalletConnect({ onConnected }: Props) {
  const { connected, publicKey } = useWallet();

  useEffect(() => {
    if (connected) onConnected();
  }, [connected, onConnected]);

  const short = publicKey
    ? `${publicKey.toBase58().slice(0, 6)}…${publicKey.toBase58().slice(-4)}`
    : null;

  return (
    <div className="flex flex-col items-center gap-5">
      <p className="text-gray-400 text-sm text-center">
        Connect your Solana wallet to start the attestation process.
      </p>

      <WalletMultiButton className="!bg-seel-purple hover:!opacity-90 !transition-opacity !rounded-xl !text-sm !font-semibold" />

      {connected && short && (
        <p className="text-seel-green text-sm font-mono">
          {short}
        </p>
      )}
    </div>
  );
}
