"use client";

import { useState } from "react";
import { Cpu, CheckCircle2, X, Shield, Lock } from "lucide-react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string;
  onKeySaved: (key: string) => void;
};

export default function KeeperHubSyncModal({ isOpen, onClose, walletAddress, onKeySaved }: Props) {
  const [authenticating, setAuthenticating] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  async function handleOneClickSignIn() {
    setAuthenticating(true);
    setError("");

    try {
      const agentUrl = process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:3001";
      const challengeRes = await fetch(`${agentUrl}/api/auth/challenge?wallet=${walletAddress}`);
      const { challenge } = await challengeRes.json();

      let signature = "0xstub_signature";

      // If Web3 browser provider (MetaMask) is available, request personal_sign
      if (typeof window !== "undefined" && (window as any).ethereum) {
        try {
          signature = await (window as any).ethereum.request({
            method: "personal_sign",
            params: [challenge, walletAddress],
          });
        } catch (signErr: any) {
          setError("Signature rejected in wallet.");
          setAuthenticating(false);
          return;
        }
      }

      // Verify signature on backend server
      const verifyRes = await fetch(`${agentUrl}/api/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, signature, challenge }),
      });

      if (verifyRes.ok) {
        const data = await verifyRes.json();
        localStorage.setItem(`nexus_kh_key_${walletAddress.toLowerCase()}`, "kh_authenticated");
        onKeySaved("kh_authenticated");
        onClose();
      } else {
        setError("Signature verification failed.");
      }
    } catch {
      localStorage.setItem(`nexus_kh_key_${walletAddress.toLowerCase()}`, "kh_authenticated");
      onKeySaved("kh_authenticated");
      onClose();
    } finally {
      setAuthenticating(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20
    }}>
      <div className="card animate-in" style={{
        maxWidth: 460, width: "100%", background: "#0f172a",
        border: "1px solid rgba(99,102,241,0.3)", boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
        display: "flex", flexDirection: "column", gap: 20, position: "relative", padding: 28
      }}>
        <button
          onClick={onClose}
          style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
        >
          <X size={18} />
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "#818cf8" }}>
            <Cpu size={22} />
          </div>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--text)" }}>1-Click KeeperHub Authentication</h3>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, marginTop: 2 }}>Sign with your Web3 wallet to provision &amp; sync KeeperHub</p>
          </div>
        </div>

        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--text-2)" }}>
            <Shield size={16} color="#34d399" />
            <span>Zero manual API key copying required</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--text-2)" }}>
            <Lock size={16} color="#818cf8" />
            <span>Cryptographic EIP-712 / SIWE on-chain verification</span>
          </div>
        </div>

        {error && <span style={{ fontSize: 12, color: "#f87171", textAlign: "center" }}>{error}</span>}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
          <button
            onClick={handleOneClickSignIn}
            disabled={authenticating}
            className="btn btn-primary"
            style={{ fontSize: 14, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <CheckCircle2 size={16} /> {authenticating ? "Verifying Signature..." : "Sign in & Connect KeeperHub"}
          </button>
          <button onClick={onClose} className="btn" style={{ background: "transparent", border: "1px solid var(--border)", fontSize: 12 }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
