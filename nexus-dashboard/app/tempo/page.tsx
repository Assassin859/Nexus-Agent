"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Zap, Wallet, Terminal, Activity } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { proxyFetch } from "@/lib/agent-fetch";
import TempoProofTable from "@/components/TempoProofTable";
import TransactionCard from "@/components/TransactionCard";
import { TEMPO_CHAIN_ID } from "@/lib/tier2-proofs";

type TempoPortfolio = {
  chainId: number;
  agenticWallet: string;
  pathUsdBalance: number | null;
  explorerUrl: string;
};

type FeedItem = {
  id?: string;
  action: string;
  amount: number;
  status: "success" | "reverted_simulation" | "reverted_chain" | "pending" | "simulated_stub" | "delayed";
  timestamp?: string;
  txHash?: string;
  reason?: string;
  aiAnalysis?: Record<string, unknown>;
};

export default function TempoPage() {
  const { walletAddress, authToken } = useWallet();
  const [tempo, setTempo] = useState<TempoPortfolio | null>(null);
  const [tempoFeed, setTempoFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [pfRes, feedRes] = await Promise.all([
          proxyFetch(`/api/portfolio/${walletAddress}`, {}, authToken),
          proxyFetch(`/api/feed/${walletAddress}`, {}, authToken),
        ]);
        const pf = await pfRes.json();
        if (pf.tempo) setTempo(pf.tempo);

        const feed = await feedRes.json();
        if (Array.isArray(feed)) {
          setTempoFeed(feed.filter((r) => r.action === "tempo_transfer").slice(0, 8));
        }
      } catch (err) {
        console.error("Tempo page load failed:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [walletAddress, authToken]);

  const shortAgentic = tempo?.agenticWallet
    ? `${tempo.agenticWallet.slice(0, 6)}…${tempo.agenticWallet.slice(-4)}`
    : null;
  const balance = tempo?.pathUsdBalance;
  const lowBalance = balance != null && balance < 0.01;

  return (
    <div className="animate-in" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: "rgba(245,158,11,0.15)",
              border: "1px solid rgba(245,158,11,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Zap size={22} color="#f59e0b" />
          </div>
          <div>
            <h1 className="page-title">Tempo Moderato</h1>
            <p className="page-subtitle">
              Chain {TEMPO_CHAIN_ID} · transfer-with-memo proofs via KeeperHub MCP
            </p>
          </div>
        </div>
        <span className="pill pill-cyan">Tempo Moderato testnet</span>
      </div>

      <div className="card" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 }}>
        <div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <Wallet size={14} /> Agentic wallet balance
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#06b6d4", marginTop: 8 }}>
            {loading ? "…" : balance == null ? "Unavailable" : `$${balance.toFixed(2)}`}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>PathUSD on Moderato</div>
          {lowBalance && (
            <div style={{ fontSize: 11, color: "#fbbf24", marginTop: 6 }}>Fund wallet before running new proofs</div>
          )}
        </div>
        <div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Signer (MPC)</div>
          <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, marginTop: 8 }}>{shortAgentic ?? "—"}</div>
          {tempo?.explorerUrl && (
            <a
              href={tempo.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 12, color: "#06b6d4", marginTop: 8, display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none", fontWeight: 600 }}
            >
              Tempo Explorer <ExternalLink size={12} />
            </a>
          )}
        </div>
        <div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <Terminal size={14} /> Run another proof
          </div>
          <code style={{ display: "block", fontSize: 11, marginTop: 10, padding: "8px 10px", background: "rgba(0,0,0,0.25)", borderRadius: 6, color: "#a5b4fc" }}>
            pnpm --prefix nexus-agent run tempo:proof
          </code>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.45 }}>
            Requires PathUSD on chain {TEMPO_CHAIN_ID}. See{" "}
            <a href="https://tempo.xyz" target="_blank" rel="noopener noreferrer" style={{ color: "#818cf8" }}>
              tempo.xyz
            </a>{" "}
            testnet docs.
          </div>
        </div>
      </div>

      <TempoProofTable />

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Activity size={18} color="#f59e0b" />
            <h3 style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontSize: 17, fontWeight: 800, margin: 0 }}>
              Live Tempo feed
            </h3>
          </div>
          <Link href="/feed" style={{ fontSize: 12, color: "#818cf8", textDecoration: "none" }}>
            Full execution feed →
          </Link>
        </div>

        {loading ? (
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading…</div>
        ) : tempoFeed.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: 13 }}>No tempo_transfer rows yet — run tempo:proof or backfill.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {tempoFeed.map((item, i) => (
              <TransactionCard key={item.id ?? i} {...item} />
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          padding: "14px 16px",
          borderRadius: 10,
          background: "rgba(99,102,241,0.08)",
          border: "1px solid rgba(99,102,241,0.2)",
          fontSize: 12,
          color: "var(--text-muted)",
          lineHeight: 1.55,
        }}
      >
        <strong style={{ color: "var(--text)" }}>Why Tempo Explorer, not KeeperHub execution links?</strong>
        {" "}
        KeeperHub <code>/executions/…</code> deep links return 404 unless you are signed into the Nexus Agent org.
        Judges should use <strong style={{ color: "#f59e0b" }}>Tempo Explorer</strong> for verifiable on-chain proof;
        workflow links are optional for team members on KeeperHub Activity.
      </div>
    </div>
  );
}
