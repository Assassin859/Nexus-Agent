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
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import KeeperHubSyncModal from "./KeeperHubSyncModal";

const NAV_ITEMS = [
  { href: "/",            label: "Portfolio",   icon: LayoutDashboard },
  { href: "/workflows",   label: "Workflows",   icon: GitFork },
  { href: "/feed",        label: "Live Feed",   icon: Activity },
  { href: "/resilience",  label: "Resilience",  icon: ShieldCheck },
  { href: "/alerts",      label: "Alerts",      icon: Bell },
  { href: "/chat",        label: "AI Chat",     icon: MessageSquare },
  { href: "/templates",   label: "Templates",   icon: Store },
];

export default function Sidebar() {
  const pathname = usePathname();
  const walletAddress = process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97cb35236a1d0190fb25b31c5c0ff4107ec1b";
  const [khConnected, setKhConnected] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    async function checkKeeperHubStatus() {
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

        {/* Footer Status Pill */}
        <div style={{ paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          <button
            onClick={() => setModalOpen(true)}
            style={{
              width: "100%", padding: "10px 12px", borderRadius: 8,
              background: khConnected ? "rgba(52,211,153,0.06)" : "rgba(245,158,11,0.06)",
              border: `1px solid ${khConnected ? "rgba(52,211,153,0.2)" : "rgba(245,158,11,0.2)"}`,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              cursor: "pointer", textDecoration: "none"
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
