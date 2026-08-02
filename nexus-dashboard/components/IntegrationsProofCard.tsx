"use client";

import { ExternalLink, Link2, Zap, Store } from "lucide-react";
import {
  HF_READ_SLUG,
  HF_READ_WORKFLOW_ID,
  MARKETPLACE_URL,
  TEMPO_PROOF_TXS,
  TEMPO_PROOF_WORKFLOW_ID,
  keeperHubExecutionUrl,
  keeperHubWorkflowUrl,
  tempoTxUrl,
} from "@/lib/tier2-proofs";

type TempoInfo = {
  chainId: number;
  agenticWallet: string;
  pathUsdBalance: number | null;
  explorerUrl: string;
};

type Props = {
  tempo?: TempoInfo | null;
};

export default function IntegrationsProofCard({ tempo }: Props) {
  const shortAgentic = tempo?.agenticWallet
    ? `${tempo.agenticWallet.slice(0, 6)}…${tempo.agenticWallet.slice(-4)}`
    : null;
  const balance = tempo?.pathUsdBalance;
  const lowBalance = balance !== null && balance !== undefined && balance < 0.01;

  const links = [
    {
      icon: Store,
      label: "Marketplace listing",
      sub: `slug: ${HF_READ_SLUG}`,
      href: MARKETPLACE_URL,
    },
    {
      icon: Link2,
      label: "HF-read workflow",
      sub: HF_READ_WORKFLOW_ID,
      href: keeperHubWorkflowUrl(HF_READ_WORKFLOW_ID),
      secondaryHref: keeperHubWorkflowUrl(TEMPO_PROOF_WORKFLOW_ID),
      secondaryLabel: "Latest Tempo workflow",
    },
  ];

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <h3 style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontSize: 17, fontWeight: 800, color: "var(--text)", margin: 0 }}>
          KeeperHub Integrations
        </h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className="pill pill-success" style={{ fontSize: 10.5 }}>Base Sepolia</span>
          <span className="pill pill-cyan" style={{ fontSize: 10.5 }}>Tempo Moderato</span>
          <span className="pill" style={{ fontSize: 10.5, background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.35)", color: "#fbbf24" }}>
            x402 $0.01
          </span>
        </div>
      </div>

      {tempo && (
        <div
          style={{
            marginBottom: 18,
            padding: "12px 14px",
            borderRadius: 10,
            background: "rgba(6,182,212,0.08)",
            border: "1px solid rgba(6,182,212,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Tempo Moderato balance</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#06b6d4", marginTop: 4 }}>
              {balance == null ? "Unavailable" : `$${balance.toFixed(2)} PathUSD`}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
              Agentic wallet {shortAgentic}
              {lowBalance && (
                <span style={{ color: "#fbbf24", marginLeft: 8 }}>· Fund wallet on Moderato</span>
              )}
            </div>
          </div>
          <a
            href={tempo.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12, color: "#06b6d4", textDecoration: "none", display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}
          >
            Tempo Explorer <ExternalLink size={12} />
          </a>
        </div>
      )}

      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Zap size={16} color="#f59e0b" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
            Tempo proof txs ({TEMPO_PROOF_TXS.length})
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[...TEMPO_PROOF_TXS].reverse().map((proof, idx) => {
            const n = TEMPO_PROOF_TXS.length - idx;
            return (
              <div
                key={proof.txHash}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid var(--border)",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ fontSize: 11, fontFamily: "monospace", color: "var(--text-muted)" }}>
                  #{n} {proof.txHash.slice(0, 10)}…{proof.txHash.slice(-6)}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <a
                    href={keeperHubExecutionUrl(proof.executionId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 11, color: "var(--text-muted)", textDecoration: "none", display: "flex", alignItems: "center", gap: 3 }}
                  >
                    Execution <ExternalLink size={10} />
                  </a>
                  <a
                    href={tempoTxUrl(proof.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 11, color: "#f59e0b", textDecoration: "none", display: "flex", alignItems: "center", gap: 3, fontWeight: 600 }}
                  >
                    Tempo Explorer <ExternalLink size={10} />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {links.map((row) => {
          const Icon = row.icon;
          return (
            <div
              key={row.label}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 12px",
                borderRadius: 8,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid var(--border)",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <Icon size={16} color="#818cf8" />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{row.label}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace" }}>{row.sub}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {"secondaryHref" in row && row.secondaryHref && (
                  <a
                    href={row.secondaryHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 11, color: "var(--text-muted)", textDecoration: "none", display: "flex", alignItems: "center", gap: 3 }}
                  >
                    {row.secondaryLabel} <ExternalLink size={10} />
                  </a>
                )}
                <a
                  href={row.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12, color: "#34d399", textDecoration: "none", display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}
                >
                  Open <ExternalLink size={12} />
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
