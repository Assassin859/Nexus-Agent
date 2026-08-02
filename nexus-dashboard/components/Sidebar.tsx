"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Activity,
  ShieldCheck,
  Bell,
  MessageSquare,
  Store,
  Cpu,
  GitFork,
  Users,
  CheckCircle2,
  AlertCircle,
  Wallet,
  Key,
  LogOut,
  Zap,
} from "lucide-react";
import KeeperHubSyncModal from "./KeeperHubSyncModal";
import { useWallet } from "@/context/WalletContext";
import { proxyFetch } from "@/lib/agent-fetch";
import { isDemoReadMode } from "@/lib/demo-wallet";

const NAV_ITEMS = [
  { href: "/",            label: "Portfolio",   icon: LayoutDashboard },
  { href: "/chat",        label: "AI Chat",     icon: MessageSquare },
  { href: "/workflows",   label: "Workflows",   icon: GitFork },
  { href: "/payees",      label: "Payees",      icon: Users },
  { href: "/feed",        label: "Live Feed",   icon: Activity },
  { href: "/tempo",       label: "Tempo",       icon: Zap },
  { href: "/resilience",  label: "Resilience",  icon: ShieldCheck },
  { href: "/alerts",      label: "Alerts",      icon: Bell },
  { href: "/templates",   label: "Templates",   icon: Store },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { walletAddress, isConnected, authToken, khSessionToken, khEmail, signOutKeeperHub, signInWithEthereum, disconnectWallet } = useWallet();
  const [khServerKey, setKhServerKey] = useState(false);
  const [hasLocalKey, setHasLocalKey] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && walletAddress) {
      setHasLocalKey(!!localStorage.getItem(`nexus_kh_key_${walletAddress}`)?.startsWith("kh_"));
    }
  }, [walletAddress]);

  const khConnected = khServerKey || hasLocalKey;
  const [modalOpen, setModalOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    async function checkKeeperHubStatus() {
      if (!walletAddress || !authToken) return;
      try {
        const res = await proxyFetch(`/api/user/settings/${walletAddress}`, {}, authToken);
        if (res.ok) {
          const data = await res.json();
          if (data.hasKey) setKhServerKey(true);
        }
      } catch {}
    }
    checkKeeperHubStatus();
  }, [walletAddress, authToken]);

  async function handleSIWE() {
    if (signingIn) return;
    setSigningIn(true);
    try {
      const res = await signInWithEthereum();
      if (res.error) {
        alert(res.error);
      }
    } finally {
      setSigningIn(false);
    }
  }

  const shortAddr = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : null;

  return (
    <>
      <aside className="sidebar">
        {/* Brand Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{
            width: 36, height: 36, borderRadius: "var(--radius-sm)",
            background: "linear-gradient(135deg, var(--primary), var(--secondary))",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 800, fontSize: 16, color: "white"
          }}>
            NX
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-space-grotesk)", fontWeight: 700, fontSize: 16, color: "var(--text)" }}>
              NexusAgent
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>
              KeeperHub Agent
            </div>
          </div>
        </div>

        {/* Account / SIWE Auth Card */}
        <div style={{
          padding: "12px", borderRadius: 8, marginBottom: 18,
          background: authToken ? "rgba(52,211,153,0.06)" : "rgba(99,102,241,0.12)",
          border: `1px solid ${authToken ? "rgba(52,211,153,0.25)" : "rgba(99,102,241,0.3)"}`,
          display: "flex", flexDirection: "column", gap: 8
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 10, color: authToken ? "#34d399" : "#818cf8", fontWeight: 700, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 4 }}>
              <Wallet size={12} /> {authToken ? "SIWE Authenticated" : "Web3 Wallet"}
            </span>
            {authToken && (
              <button onClick={disconnectWallet} title="Sign Out" style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", display: "flex", alignItems: "center", gap: 2, fontSize: 10 }}>
                <LogOut size={10} /> Disconnect
              </button>
            )}
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", fontFamily: "monospace" }}>
            {shortAddr}
          </div>

          {isDemoReadMode(authToken, walletAddress) && (
            <span className="pill pill-cyan" style={{ fontSize: 9, alignSelf: "flex-start", padding: "2px 8px" }}>
              Demo
            </span>
          )}

          {!authToken && (
            <button
              onClick={handleSIWE}
              disabled={signingIn}
              className="btn btn-primary"
              style={{ width: "100%", padding: "6px 10px", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 2 }}
            >
              <Key size={12} />
              {signingIn ? "Signing Challenge..." : "Sign In with Ethereum"}
            </button>
          )}
        </div>

        {/* Nav Links */}
        <nav style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`nav-item ${isActive ? "active" : ""}`}
              >
                <Icon size={18} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* KeeperHub Connection Status (3-Tier Model) */}
        <div style={{ paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          {khServerKey ? (
            // Tier 1: Real MCP Key Active
            <div style={{
              padding: "10px 12px", borderRadius: 8,
              background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.2)",
              display: "flex", flexDirection: "column", gap: 4
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Cpu size={13} color="#34d399" />
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#34d399" }}>KeeperHub MCP Connected</span>
                </div>
                <CheckCircle2 size={11} color="#34d399" />
              </div>
              <span style={{ fontSize: 9, color: "var(--text-muted)" }}>API Key &amp; Remote Workflows Active</span>
            </div>
          ) : khSessionToken || khEmail ? (
            // Tier 2: OAuth Session Active without Saved Key
            <button
              onClick={() => setModalOpen(true)}
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 8,
                background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)",
                display: "flex", flexDirection: "column", gap: 4, cursor: "pointer", textAlign: "left"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Cpu size={13} color="#f59e0b" />
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b" }}>OAuth Session Active</span>
                </div>
                <AlertCircle size={11} color="#f59e0b" />
              </div>
              <span style={{ fontSize: 9, color: "var(--text-muted)" }}>Click to configure MCP API key</span>
            </button>
          ) : (
            // Tier 3: Unlinked
            <button
              onClick={() => setModalOpen(true)}
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 8,
                background: "rgba(245,158,11,0.06)",
                border: "1px solid rgba(245,158,11,0.2)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Cpu size={14} color="#f59e0b" />
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b" }}>KeeperHub Unlinked</span>
                  <span style={{ fontSize: 9, color: "var(--text-muted)" }}>Click to sign in</span>
                </div>
              </div>
              <AlertCircle size={12} color="#f59e0b" />
            </button>
          )}
        </div>
      </aside>

      <KeeperHubSyncModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        walletAddress={walletAddress}
        onKeySaved={() => setKhServerKey(true)}
      />
    </>
  );
}
