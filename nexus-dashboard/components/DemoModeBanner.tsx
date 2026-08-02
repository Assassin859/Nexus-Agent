"use client";

import { AlertCircle, Key } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { getDemoWallet, isDemoReadMode } from "@/lib/demo-wallet";

export default function DemoModeBanner() {
  const { walletAddress, authToken, signInWithEthereum } = useWallet();

  if (!isDemoReadMode(authToken, walletAddress)) {
    return null;
  }

  const short = `${getDemoWallet().slice(0, 6)}…${getDemoWallet().slice(-4)}`;

  return (
    <div
      style={{
        background: "rgba(6,182,212,0.08)",
        border: "1px solid rgba(6,182,212,0.28)",
        borderRadius: 10,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        color: "#06b6d4",
        fontSize: 13,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <AlertCircle size={16} />
        <span>
          <strong>Demo mode</strong> — read-only view of monitored wallet{" "}
          <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{short}</span>.
          Sign in with Ethereum to connect your own wallet.
        </span>
      </div>
      <button
        type="button"
        onClick={() => signInWithEthereum()}
        className="btn btn-primary"
        style={{ padding: "6px 12px", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}
      >
        <Key size={12} /> Sign In
      </button>
    </div>
  );
}
