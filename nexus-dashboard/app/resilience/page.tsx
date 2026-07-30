"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock, ShieldX } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { proxyFetch } from "@/lib/agent-fetch";

type LogItem = {
  action: string;
  amount: number;
  status: string;
  reason?: string;
};

type ScenarioCard = {
  icon: any;
  title: string;
  pill: { label: string; cls: string };
  desc: string;
  code: { text: string; color: string; bg: string; border: string };
  accent: { color: string; bg: string; border: string };
  side: string;
};

const INITIAL_SCENARIOS: ScenarioCard[] = [
  {
    icon: CheckCircle2,
    title: "Happy Path Run",
    pill: { label: "Broadcast & Mined", cls: "pill-success" },
    desc: "Transactions passing pre-flight simulation are broadcast to Sepolia and mined with zero errors.",
    code: { text: "Status: WAITING FOR RUN\nNo successful executions recorded yet.", color: "#34d399", bg: "rgba(16,185,129,0.09)", border: "rgba(16,185,129,0.25)" },
    accent: { color: "#34d399", bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.3)" },
    side: "#10b981",
  },
  {
    icon: Clock,
    title: "Gas Adjusted Path",
    pill: { label: "Delayed Execution", cls: "pill-warning" },
    desc: "Actions (e.g. DCA swaps) where estimated gas exceeds safety thresholds are paused to prevent gas loss.",
    code: { text: "Status: WAITING FOR RUN\nNo gas-adjusted pauses recorded.", color: "#fbbf24", bg: "rgba(245,158,11,0.09)", border: "rgba(245,158,11,0.25)" },
    accent: { color: "#fbbf24", bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.3)" },
    side: "#f59e0b",
  },
  {
    icon: ShieldX,
    title: "Caught Revert",
    pill: { label: "Pre-Flight Intercept", cls: "pill-danger" },
    desc: "Simulation engine detects contract reverts or missing allowances and aborts execution before broadcasting.",
    code: { text: "Status: WAITING FOR RUN\nNo caught reverts recorded.", color: "#fb7185", bg: "rgba(244,63,94,0.09)", border: "rgba(244,63,94,0.25)" },
    accent: { color: "#fb7185", bg: "rgba(244,63,94,0.10)", border: "rgba(244,63,94,0.3)" },
    side: "#f43f5e",
  },
];

export default function ResiliencePage() {
  const { walletAddress: wallet, authToken } = useWallet();
  const [scenarios, setScenarios] = useState(INITIAL_SCENARIOS);

  useEffect(() => {
    async function loadResilience() {
      try {
        const res = await proxyFetch(`/api/feed/${wallet}`, {}, authToken);
        const data: LogItem[] = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const happy = data.find(d => d.status === "success");
          const paused = data.find(d => d.status === "pending" || d.reason?.includes("Gas"));
          const revert = data.find(d => d.status === "reverted_simulation" || d.status === "reverted_chain");

          const updated = [...INITIAL_SCENARIOS];
          if (happy) {
            updated[0].desc = `Action ${happy.action.toUpperCase()} executed successfully for amount $${happy.amount}.`;
            updated[0].code.text = `Status: SUCCESS (200 OK)\nReason: ${happy.reason || "Mined on Sepolia"}`;
          }
          if (paused) {
            updated[1].desc = `Action ${paused.action.toUpperCase()} evaluated. Gas or cycle limit rules applied.`;
            updated[1].code.text = `Status: PAUSED\nReason: ${paused.reason || "Gas limit rule active"}`;
          }
          if (revert) {
            updated[2].desc = `Simulation intercepted revert before broadcasting to Sepolia chain.`;
            updated[2].code.text = `Status: ABORTED (Sim Revert)\nReason: ${revert.reason || "Revert caught, 0 gas wasted"}`;
          }
          setScenarios(updated);
        }
      } catch (err) {
        console.error("Resilience fetch error:", err);
      }
    }
    loadResilience();
  }, [wallet, authToken]);

  return (
    <div className="animate-in" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div className="page-header">
        <h1 className="page-title">Resilience &amp; Simulation Log</h1>
        <p className="page-subtitle">Every action is simulated prior to broadcast. Zero gas wasted on reverts.</p>
      </div>

      <div className="grid-3">
        {scenarios.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.title}
              className="card"
              style={{ display: "flex", flexDirection: "column", gap: 20, borderLeft: `3px solid ${s.side}` }}
            >
              <div className="res-header">
                <div
                  className="res-icon"
                  style={{ background: s.accent.bg, color: s.accent.color, border: `1px solid ${s.accent.border}` }}
                >
                  <Icon size={22} />
                </div>
                <div>
                  <div style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 800, fontSize: 15, color: "var(--text)", marginBottom: 6 }}>
                    {s.title}
                  </div>
                  <span className={`pill ${s.pill.cls}`}>{s.pill.label}</span>
                </div>
              </div>
              <p style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.65, fontWeight: 500 }}>{s.desc}</p>
              <div
                className="res-code"
                style={{ background: s.code.bg, border: `1px solid ${s.code.border}`, color: s.code.color }}
              >
                {s.code.text.split("\n").map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
