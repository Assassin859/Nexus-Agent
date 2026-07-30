"use client";

import { useState } from "react";
import { Cpu, ExternalLink, X, Shield, CheckCircle2, Key } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { agentFetch } from "@/lib/agent-fetch";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string;
  onKeySaved: (key: string) => void;
};

export default function KeeperHubSyncModal({ isOpen, onClose, walletAddress, onKeySaved }: Props) {
  const { signInWithKeeperHub, khSessionToken, khEmail, signOutKeeperHub, authToken } = useWallet();
  const [wfbKeyInput, setWfbKeyInput] = useState("");
  const [savingWfb, setSavingWfb] = useState(false);
  const [error, setError] = useState("");
  const [showWfbSection, setShowWfbSection] = useState(false);

  if (!isOpen) return null;

  // If already connected via KeeperHub OAuth
  if (khSessionToken) {
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20
      }}>
        <div className="card animate-in" style={{
          maxWidth: 440, width: "100%", background: "#0f172a",
          border: "1px solid rgba(52,211,153,0.3)", boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
          display: "flex", flexDirection: "column", gap: 20, position: "relative", padding: 28
        }}>
          <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
            <X size={18} />
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CheckCircle2 size={22} color="#34d399" />
            </div>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#34d399" }}>KeeperHub Connected</h3>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, marginTop: 2 }}>
                {khEmail ? `Signed in as ${khEmail}` : "OAuth session active"}
              </p>
            </div>
          </div>

          <div style={{ background: "rgba(52,211,153,0.05)", border: "1px solid rgba(52,211,153,0.15)", borderRadius: 10, padding: 14, fontSize: 12, color: "var(--text-2)", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Shield size={14} color="#34d399" />
              <span>Turnkey MPC wallet synced</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Shield size={14} color="#34d399" />
              <span>Workflows & payees linked to your account</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} className="btn btn-primary" style={{ flex: 1 }}>
              Done
            </button>
            <button
              onClick={() => { signOutKeeperHub(); }}
              className="btn"
              style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", color: "#f87171" }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  async function handleSaveWfbKey(e: React.FormEvent) {
    e.preventDefault();
    if (!wfbKeyInput.trim()) return;
    setSavingWfb(true);
    setError("");
    try {
      const res = await agentFetch("/api/user/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, keeperhubApiKey: wfbKeyInput.trim() }),
      }, authToken);
      if (res.ok) {
        onKeySaved(wfbKeyInput.trim());
        onClose();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to save key.");
      }
    } catch {
      setError("Network error saving key.");
    } finally {
      setSavingWfb(false);
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
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
          <X size={18} />
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "#818cf8" }}>
            <Cpu size={22} />
          </div>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--text)" }}>Connect KeeperHub</h3>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, marginTop: 2 }}>
              Sign in via KeeperHub to sync your workflows, payees & Turnkey wallet
            </p>
          </div>
        </div>

        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--text-2)" }}>
            <Shield size={14} color="#34d399" />
            <span>No manual API key copying required</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--text-2)" }}>
            <Shield size={14} color="#818cf8" />
            <span>Authenticates via the KeeperHub website (OAuth)</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--text-2)" }}>
            <Shield size={14} color="#f59e0b" />
            <span>Syncs all your remote workflows & payees automatically</span>
          </div>
        </div>

        {error && <span style={{ fontSize: 12, color: "#f87171" }}>{error}</span>}

        {/* Primary — KeeperHub OAuth */}
        <button
          onClick={signInWithKeeperHub}
          className="btn btn-primary"
          style={{ fontSize: 14, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
        >
          <ExternalLink size={16} />
          Sign in via KeeperHub
        </button>

        {/* Secondary — WFB webhook key (trigger-only, not general auth) */}
        <div>
          <button
            onClick={() => setShowWfbSection(v => !v)}
            style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
          >
            <Key size={12} />
            {showWfbSection ? "Hide" : "Advanced"}: Configure WFB webhook trigger key
          </button>

          {showWfbSection && (
            <form onSubmit={handleSaveWfbKey} style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
                ⚠️ <strong>WFB keys are for webhook triggers only</strong>, not general authentication.
              </p>
              <input
                type="text"
                placeholder="wfb_xxxxxxxxxxxxxxxxxxxxxxxx"
                value={wfbKeyInput}
                onChange={e => setWfbKeyInput(e.target.value)}
                style={{
                  padding: "10px 14px", borderRadius: 8, background: "rgba(255,255,255,0.05)",
                  border: "1px solid var(--border)", color: "var(--text)", fontSize: 13, fontFamily: "monospace"
                }}
              />
              <button
                type="submit"
                disabled={savingWfb || !wfbKeyInput.trim()}
                className="btn"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid var(--border)", color: "var(--text)", fontSize: 12 }}
              >
                {savingWfb ? "Saving..." : "Save WFB Trigger Key"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
