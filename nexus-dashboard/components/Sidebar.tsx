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
  Bot
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
        {/* Brand Monogram */}
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-indigo-800 flex items-center justify-center font-extrabold text-white text-lg shadow-lg shadow-indigo-500/30 border border-indigo-400/30">
            NX
          </div>
          <div>
            <h1 className="font-heading font-black text-xl leading-none text-white tracking-tight">NexusAgent</h1>
            <p className="text-xs text-[var(--color-text-muted)] mt-1 font-medium">Autonomous Wealth</p>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex flex-col gap-1.5">
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
                    ? "bg-indigo-500/15 text-indigo-400 font-semibold border-l-4 border-indigo-500 shadow-sm"
                    : "text-[var(--color-text-muted)] hover:text-white hover:bg-white/5"
                )}
              >
                <Icon size={18} className={isActive ? "text-indigo-400" : "text-slate-400"} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Network Status Badge */}
      <div className="glass-card p-4 rounded-xl text-xs text-[var(--color-text-muted)] flex flex-col gap-2 border border-white/5 bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <Bot size={14} className="text-indigo-400" />
          <span className="font-semibold text-white">KeeperHub MCP</span>
        </div>
        <div className="flex items-center justify-between text-[11px] pt-1 border-t border-white/5">
          <span>Sepolia Testnet</span>
          <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Active
          </span>
        </div>
      </div>
    </aside>
  );
}
