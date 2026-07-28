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
  ChevronDown,
} from "lucide-react";
import KeeperHubSyncModal from "./KeeperHubSyncModal";
import { useWallet } from "@/context/WalletContext";

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
  const { walletAddress, setWalletAddress, isConnected } = useWallet();
  const [khConnected, setKhConnected] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    async function checkKeeperHubStatus() {
      if (!walletAddress) return;
      const localKey = localStorage.getItem(`nexus_kh_key_${walletAddress.toLowerCase()}`);
      if (localKey) {
        setKhConnected(true);
        return;
      }
      try {
        const agentUrl = process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:3001";
        const res = await fetch(`${agentUrl}/api/user/settings/${walletAddress}`);
        if (res.ok) {
          const data = await res.json();
          if (data.hasKey) setKhConnected(true);
        }
      } catch {}
    }
    checkKeeperHubStatus();
  }, [walletAddress]);

  async function handleConnectWallet() {
    if (connecting) return;
    setConnecting(true);
    try {
      if (typeof window !== "undefined" && (window as any).ethereum) {
        const accounts: string[] = await (window as any).ethereum.request({
          method: "eth_requestAccounts",
        });
        if (accounts.length > 0) {
          setWalletAddress(accounts[0]);
          setKhConnected(false); // reset KH status for new wallet
        }
      } else {
        alert("MetaMask not detected. Please install MetaMask to connect a wallet.");
      }
    } catch (err: any) {
      console.error("Wallet connection failed:", err.message);
    } finally {
      setConnecting(false);
    }
  }

  const shortAddr = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : null;

  return (
    <>
      <aside className="sidebar">
        {/* Brand Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
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

        {/* Wallet Connect Button */}
        <button
          onClick={handleConnectWallet}
          style={{
            width: "100%", padding: "10px 12px", borderRadius: 8, marginBottom: 20,
            background: isConnected ? "rgba(52,211,153,0.06)" : "rgba(99,102,241,0.12)",
            border: `1px solid ${isConnected ? "rgba(52,211,153,0.25)" : "rgba(99,102,241,0.3)"}`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            cursor: "pointer",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Wallet size={14} color={isConnected ? "#34d399" : "#818cf8"} />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: isConnected ? "#34d399" : "#818cf8" }}>
                {connecting ? "Connecting..." : isConnected ? shortAddr : "Connect Wallet"}
              </span>
              <span style={{ fontSize: 9, color: "var(--text-muted)" }}>
                {isConnected ? "MetaMask Connected" : "Click to connect MetaMask"}
              </span>
            </div>
          </div>
          {isConnected && <ChevronDown size={12} color="#34d399" />}
        </button>

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

        {/* KeeperHub Status */}
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
                  KeeperHub {khConnected ? "Connected" : "Unlinked"}
                </span>
                <span style={{ fontSize: 9, color: "var(--text-muted)" }}>
                  {khConnected ? "API Key Active" : "Click to Link Account"}
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
