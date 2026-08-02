"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, Calendar, Repeat, Banknote, Bell, Scale, ArrowRight } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { proxyFetch } from "@/lib/agent-fetch";
import Pagination from "@/components/Pagination";
import { usePagination } from "@/hooks/usePagination";

type DeployMode =
  | { mode: "api"; apiPath: string; body?: Record<string, unknown>; redirect?: string }
  | { mode: "chat" }
  | { mode: "blocked"; reason: string };

const TEMPLATES: Array<{
  icon: typeof Shield;
  color: string;
  title: string;
  desc: string;
  tag: string;
  prompt: string;
  deploy: DeployMode;
}> = [
  {
    icon: Shield,
    color: "#6366f1",
    title: "Aave Guardian",
    desc: "Auto-repay loan debt when Health Factor drops below 1.15 on Aave V3 Base Sepolia.",
    tag: "Lending Protection",
    prompt: "Protect my Aave V3 position. Repay USDC if Health Factor drops below 1.15.",
    deploy: { mode: "api", apiPath: "/api/trigger/guardian", redirect: "/feed" },
  },
  {
    icon: Calendar,
    color: "#10b981",
    title: "USDC → ETH Weekly DCA",
    desc: "Automated weekly token purchase on Uniswap V3 with strict 0.5% MEV slippage cap.",
    tag: "Dollar-Cost Avg",
    prompt: "Buy 100 USDC worth of ETH every Monday at 9am using Uniswap V3.",
    deploy: {
      mode: "api",
      apiPath: "/api/dca/schedule",
      body: { amount: 100, schedule: "every Monday at 9am" },
      redirect: "/workflows",
    },
  },
  {
    icon: Repeat,
    color: "#3b82f6",
    title: "Stablecoin Yield Rotator",
    desc: "Moves USDC allocations between Aave and Compound when profit covers gas.",
    tag: "Yield Optimization",
    prompt: "Rotate USDC yield to Compound V3 when APY is 1% higher than Aave V3.",
    deploy: {
      mode: "blocked",
      reason: "Requires monitored wallet = agentic MPC wallet (Aave withdraw has no onBehalfOf).",
    },
  },
  {
    icon: Banknote,
    color: "#a855f7",
    title: "Developer Payroll",
    desc: "Recurring scheduled token transfer targeting recipient wallets with safety ceilings.",
    tag: "DAO Payroll",
    prompt: "Pay 200 USDC to 0x89f97cb35236a1d0190fb25b31c5c0ff4107ec1b every Friday.",
    deploy: {
      mode: "api",
      apiPath: "/api/payroll",
      body: {
        amount: 200,
        recipient: "0x89f97cb35236a1d0190fb25b31c5c0ff4107ec1b",
        schedule: "every Friday at 9am",
      },
      redirect: "/workflows",
    },
  },
  {
    icon: Bell,
    color: "#f59e0b",
    title: "Liquidation Notifier",
    desc: "Dispatches instant alerts when lending positions cross warning threshold (HF 1.15–1.40).",
    tag: "Monitoring",
    prompt: "Send alert notification if Aave Health Factor drops below 1.40.",
    deploy: { mode: "chat" },
  },
  {
    icon: Scale,
    color: "#ec4899",
    title: "Multi-Protocol Rebalancer",
    desc: "Maintains balanced distribution across Aave and Compound V3.",
    tag: "Rebalancing",
    prompt: "Rebalance stablecoin portfolio evenly across Aave V3 and Compound V3.",
    deploy: {
      mode: "blocked",
      reason: "Requires monitored wallet = agentic MPC wallet for on-chain rotation.",
    },
  },
];

const PAGE_SIZE = 3;

export default function TemplatesPage() {
  const router = useRouter();
  const { authToken } = useWallet();
  const [deploying, setDeploying] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const { page, setPage, totalPages, pagedItems, total, showPagination } = usePagination(
    TEMPLATES,
    PAGE_SIZE,
    [],
  );

  const handleFork = async (tmpl: (typeof TEMPLATES)[0]) => {
    if (tmpl.deploy.mode === "blocked") return;

    setDeploying(tmpl.title);
    setStatusMsg(null);

    if (tmpl.deploy.mode === "api" && authToken) {
      const apiDeploy = tmpl.deploy;
      try {
        const res = await proxyFetch(
          apiDeploy.apiPath,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(apiDeploy.body ?? {}),
          },
          authToken,
        );

        if (res.ok) {
          setStatusMsg(`✅ ${tmpl.title} deployed!`);
          setTimeout(() => router.push(apiDeploy.redirect ?? "/workflows"), 1200);
          return;
        }
        const err = await res.json().catch(() => ({}));
        setStatusMsg(`❌ ${(err as { error?: string; message?: string }).error || (err as { message?: string }).message || "Deploy failed"}`);
        setDeploying(null);
        return;
      } catch {
        setStatusMsg("❌ Network error — try again or use AI Chat.");
        setDeploying(null);
        return;
      }
    }

    sessionStorage.setItem("pending_chat_prompt", tmpl.prompt);
    router.push("/chat");
  };

  return (
    <div className="animate-in" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div className="page-header">
        <h1 className="page-title">Workflow Template Store</h1>
        <p className="page-subtitle">Pre-configured KeeperHub automations — Fork and deploy in 60 seconds</p>
      </div>

      {statusMsg && (
        <div
          style={{
            background: statusMsg.startsWith("❌") ? "rgba(239,68,68,0.1)" : "rgba(52,211,153,0.1)",
            border: statusMsg.startsWith("❌") ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(52,211,153,0.3)",
            borderRadius: 8,
            padding: 12,
            color: statusMsg.startsWith("❌") ? "#f87171" : "#34d399",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {statusMsg}
        </div>
      )}

      {showPagination && (
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
      )}

      <div className="grid-3">
        {pagedItems.map((tmpl) => {
          const Icon = tmpl.icon;
          const isSelected = deploying === tmpl.title;
          const isBlocked = tmpl.deploy.mode === "blocked";
          const blockedReason = tmpl.deploy.mode === "blocked" ? tmpl.deploy.reason : undefined;
          return (
            <div
              key={tmpl.title}
              className="card card-interactive tmpl-card"
              style={isBlocked ? { opacity: 0.65 } : undefined}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div
                    className="tmpl-icon"
                    style={{
                      width: 50,
                      height: 50,
                      background: `${tmpl.color}18`,
                      color: tmpl.color,
                      border: `1px solid ${tmpl.color}30`,
                    }}
                  >
                    <Icon size={24} />
                  </div>
                  <span
                    className={isBlocked ? "pill" : "pill pill-success"}
                    style={{ fontSize: 10.5 }}
                    title={blockedReason}
                  >
                    {isBlocked ? "Same wallet required" : "Deploy in 60s"}
                  </span>
                </div>
                <div className="tmpl-name">{tmpl.title}</div>
                <p className="tmpl-desc">{tmpl.desc}</p>
                {blockedReason && (
                  <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.4 }}>
                    {blockedReason}
                  </p>
                )}
              </div>
              <div className="tmpl-footer">
                <span className="tmpl-tag">{tmpl.tag}</span>
                {isBlocked ? (
                  <button disabled className="btn" style={{ padding: "7px 14px", fontSize: 12, opacity: 0.5 }}>
                    Unavailable
                  </button>
                ) : (
                  <button
                    onClick={() => handleFork(tmpl)}
                    disabled={!!deploying}
                    className="btn btn-primary"
                    style={{ padding: "7px 14px", fontSize: 12 }}
                  >
                    {isSelected ? "Deploying..." : "Fork & Deploy"} <ArrowRight size={13} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showPagination && (
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
      )}
    </div>
  );
}
