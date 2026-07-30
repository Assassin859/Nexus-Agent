"use client";

import { useState } from "react";
import { Cpu, CheckCircle2, X, Shield, Lock, Key } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { agentFetch } from "@/lib/agent-fetch";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string;
  onKeySaved: (key: string) => void;
};

export default function KeeperHubSyncModal({ isOpen, onClose, walletAddress, onKeySaved }: Props) {
  const { signInWithEthereum, authToken } = useWallet();
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [authenticating, setAuthenticating] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  async function handleSIWESignIn() {
    setAuthenticating(true);
    setError("");

    try {
      const res = await signInWithEthereum();
      if (res.success) {
        onKeySaved("kh_authenticated");
        onClose();
      } else if (res.error) {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setAuthenticating(false);
    }
  }

  async function handleSaveCustomKey(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKeyInput.trim()) return;

    setAuthenticating(true);
    setError("");

    try {
      const res = await agentFetch(
        "/api/user/settings",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress, keeperhubApiKey: apiKeyInput.trim() }),
        },
        authToken
      );

      if (res.ok) {
        onKeySaved(apiKeyInput.trim());
        onClose();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to save KeeperHub API key.");
      }
    } catch (err) {
      setError("Network error saving key.");
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
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--text)" }}>KeeperHub Key &amp; Session</h3>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, marginTop: 2 }}>Authenticate with Ethereum or configure a custom KeeperHub API key</p>
          </div>
        </div>

        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--text-2)" }}>
            <Shield size={16} color="#34d399" />
            <span>Connects directly to your KeeperHub Turnkey MPC Wallet</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--text-2)" }}>
            <Lock size={16} color="#818cf8" />
            <span>Cryptographic SIWE session isolation</span>
          </div>
        </div>

        {error && <span style={{ fontSize: 12, color: "#f87171", textAlign: "center" }}>{error}</span>}

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <button
            onClick={handleSIWESignIn}
            disabled={authenticating}
            className="btn btn-primary"
            style={{ fontSize: 13, padding: "11px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <CheckCircle2 size={16} /> {authenticating ? "Verifying SIWE..." : "Sign In with Ethereum"}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-muted)", fontSize: 11, textAlign: "center" }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span>OR CONFIGURE CUSTOM KEEPERHUB API KEY</span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>

          <form onSubmit={handleSaveCustomKey} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              type="text"
              placeholder="kh_xxxxxxxxxxxxxxxxxxxxxxxx"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              style={{
                padding: "10px 14px", borderRadius: 8, background: "rgba(255,255,255,0.05)",
                border: "1px solid var(--border)", color: "var(--text)", fontSize: 13, fontFamily: "monospace"
              }}
            />
            <button
              type="submit"
              disabled={authenticating || !apiKeyInput.trim()}
              className="btn"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid var(--border)", color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
            >
              <Key size={14} /> Save Custom API Key
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
