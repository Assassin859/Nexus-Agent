"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  Activity, 
  ShieldCheck, 
  Bell, 
  MessageSquare, 
  Store 
} from "lucide-react";
import clsx from "clsx";

const NAV_ITEMS = [
  { href: "/", label: "Portfolio", icon: LayoutDashboard },
  { href: "/feed", label: "Live Feed", icon: Activity },
  { href: "/resilience", label: "Resilience", icon: ShieldCheck },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/chat", label: "AI Chat", icon: MessageSquare },
  { href: "/templates", label: "Templates", icon: Store },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-[var(--color-border)] bg-[var(--color-surface)] p-6 flex flex-col justify-between shrink-0 min-h-screen">
      <div>
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="w-10 h-10 rounded-xl bg-[var(--color-primary)] flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/30">
            NX
          </div>
          <div>
            <h1 className="font-heading font-bold text-lg leading-tight">NexusAgent</h1>
            <p className="text-xs text-[var(--color-text-muted)]">Autonomous Wealth</p>
          </div>
        </div>

        <nav className="flex flex-col gap-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  "flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all duration-200",
                  isActive
                    ? "bg-[var(--color-primary-dim)] text-[var(--color-primary)] border-l-4 border-[var(--color-primary)]"
                    : "text-[var(--color-text-muted)] hover:text-white hover:bg-white/5"
                )}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-4 glass rounded-xl text-xs text-[var(--color-text-muted)] flex flex-col gap-1">
        <span className="font-semibold text-white">KeeperHub MCP</span>
        <span>Network: Sepolia Testnet</span>
        <span className="text-[10px] text-emerald-400">● Engine Active</span>
      </div>
    </aside>
  );
}
