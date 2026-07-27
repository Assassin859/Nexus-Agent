"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Activity,
  ShieldCheck,
  Bell,
  MessageSquare,
  Store,
  Cpu,
  GitFork,
} from "lucide-react";

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

  return (
    <aside className="sidebar">
      <div>
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="sidebar-logo">NX</div>
          <div>
            <div className="sidebar-name">NexusAgent</div>
            <div className="sidebar-tag">KeeperHub Agent</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item${isActive ? " active" : ""}`}
              >
                <Icon size={17} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer status */}
      <div className="sidebar-footer">
        <div className="sidebar-footer-title">
          <Cpu size={14} color="var(--cyan)" />
          KeeperHub MCP
        </div>
        <div className="sidebar-footer-row">
          <span>Sepolia Testnet</span>
          <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--success)", fontWeight: 700 }}>
            <span className="status-dot" />
            Active
          </span>
        </div>
      </div>
    </aside>
  );
}
