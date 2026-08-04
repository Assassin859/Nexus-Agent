"use client";

import { AlertCircle, RotateCcw } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { isDemoWallet } from "@/lib/demo-wallet";

export default function StaleDemoSessionBanner() {
  const { walletAddress, authToken, isConnected, disconnectWallet } = useWallet();

  if (!authToken || !isDemoWallet(walletAddress) || isConnected) {
    return null;
  }

  return (
    <div
      style={{
        background: "rgba(245,158,11,0.08)",
        border: "1px solid rgba(245,158,11,0.28)",
        borderRadius: 10,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        color: "#fbbf24",
        fontSize: 13,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <AlertCircle size={16} />
        <span>
          <strong>Previous sign-in detected</strong> — viewing public demo data for the monitored wallet.
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
          borderColor: "rgba(245,158,11,0.35)",
          color: "#fbbf24",
        }}
      >
        <RotateCcw size={12} /> Return to public preview
      </button>
    </div>
  );
}
