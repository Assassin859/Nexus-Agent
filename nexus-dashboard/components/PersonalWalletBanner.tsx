"use client";

import { AlertCircle, RotateCcw } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { isDemoWallet } from "@/lib/demo-wallet";

export default function PersonalWalletBanner() {
  const { walletAddress, authToken, disconnectWallet } = useWallet();

  if (!authToken || isDemoWallet(walletAddress)) {
    return null;
  }

  const short = `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`;

  return (
    <div
      style={{
        background: "rgba(99,102,241,0.08)",
        border: "1px solid rgba(99,102,241,0.28)",
        borderRadius: 10,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        color: "#818cf8",
        fontSize: 13,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <AlertCircle size={16} />
        <span>
          <strong>Personal wallet view</strong> — signed in as{" "}
          <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{short}</span>.
          This testnet wallet likely has no NexusAgent history.
        </span>
      </div>
      <button
        type="button"
        onClick={() => disconnectWallet()}
        className="btn btn-ghost"
        style={{
          padding: "6px 12px",
          fontSize: 12,
          display: "flex",
          alignItems: "center",
          gap: 6,
          borderColor: "rgba(99,102,241,0.35)",
          color: "#818cf8",
        }}
      >
        <RotateCcw size={12} /> Return to public preview
      </button>
    </div>
  );
}
