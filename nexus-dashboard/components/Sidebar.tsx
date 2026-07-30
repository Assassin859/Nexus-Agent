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
} from "lucide-react";
import KeeperHubSyncModal from "./KeeperHubSyncModal";
import { useWallet } from "@/context/WalletContext";
import { agentFetch } from "@/lib/agent-fetch";

const NAV_ITEMS = [
  { href: "/",            label: "Portfolio",   icon: LayoutDashboard },
  { href: "/payees",      label: "Payees",      icon: Users },
  { href: "/workflows",   label: "Workflows",   icon: GitFork },
  { href: "/feed",        label: "Live Feed",   icon: Activity },
  { href: "/resilience",  label: "Resilience",  icon: ShieldCheck },
  { href: "/alerts",      label: "Alerts",      icon: Bell },
  { href: "/chat",        label: "AI Chat",     icon: MessageSquare },
  { href: "/templates",   label: "Templates",   icon: Store },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { walletAddress, isConnected, authToken, signInWithEthereum, disconnectWallet } = useWallet();
  const [khConnected, setKhConnected] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    async function checkKeeperHubStatus() {
      if (!walletAddress || !authToken) return;
      try {
        const res = await agentFetch(`/api/user/settings/${walletAddress}`, {}, authToken);
        if (res.ok) {
          const data = await res.json();
          if (data.hasKey) setKhConnected(true);
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
      if (res.success) {
        setKhConnected(true);
      } else if (res.error) {
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

        {/* KeeperHub Key Settings */}
        <div style={{ paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          <button
            onClick={() => setModalOpen(true)}
            style={{
              width: "100%", padding: "10px 12px", borderRadius: 8,
              background: khConnected ? "rgba(52,211,153,0.06)" : "rgba(245,158,11,0.06)",
              border: `1px solid ${khConnected ? "rgba(52,211,153,0.2)" : "rgba(245,158,11,0.2)"}`,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Cpu size={14} color={khConnected ? "#34d399" : "#f59e0b"} />
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: khConnected ? "#34d399" : "#f59e0b" }}>
                  KeeperHub {khConnected ? "Key Active" : "Key Settings"}
                </span>
                <span style={{ fontSize: 9, color: "var(--text-muted)" }}>
                  {khConnected ? "Custom API Key" : "Configure Custom Key"}
                </span>
              </div>
            </div>
            {khConnected ? <CheckCircle2 size={12} color="#34d399" /> : <AlertCircle size={12} color="#f59e0b" />}
          </button>
        </div>
      </aside>

      <KeeperHubSyncModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        walletAddress={walletAddress}
        onKeySaved={() => setKhConnected(true)}
      />
    </>
  );
}
