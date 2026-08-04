"use client";

import { ExternalLink, Link2, Store, Copy, Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  HF_READ_SLUG,
  HF_READ_WORKFLOW_ID,
  MARKETPLACE_URL,
  X402_PROOF_TX,
  baseMainnetTxUrl,
} from "@/lib/tier2-proofs";
import KeeperHubWorkflowLink from "@/components/KeeperHubWorkflowLink";

export default function IntegrationsProofCard() {
  const [copiedSlug, setCopiedSlug] = useState(false);

  function copySlug() {
    navigator.clipboard.writeText(HF_READ_SLUG);
    setCopiedSlug(true);
    setTimeout(() => setCopiedSlug(false), 2000);
  }

  const links = [
    {
      icon: Store,
      label: "Marketplace listing (public)",
      sub: `slug: ${HF_READ_SLUG}`,
      href: MARKETPLACE_URL,
    },
  ];

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <h3 style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontSize: 17, fontWeight: 800, color: "var(--text)", margin: 0 }}>
          KeeperHub Marketplace
        </h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className="pill pill-success" style={{ fontSize: 10.5 }}>Base Sepolia</span>
          <span className="pill" style={{ fontSize: 10.5, background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.35)", color: "#fbbf24" }}>
            x402 $0.01
          </span>
          {X402_PROOF_TX ? (
            <span className="pill pill-success" style={{ fontSize: 10.5 }}>Paid call verified</span>
          ) : null}
        </div>
      </div>

      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.5 }}>
        Tempo Moderato proofs live on the{" "}
        <Link href="/tempo" style={{ color: "#06b6d4", fontWeight: 600, textDecoration: "none" }}>
          Tempo page →
        </Link>
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {X402_PROOF_TX ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 12px",
              borderRadius: 8,
              background: "rgba(52,211,153,0.06)",
              border: "1px solid rgba(52,211,153,0.25)",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <ExternalLink size={16} color="#34d399" />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                  x402 payment (Base mainnet)
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace" }}>
                  {X402_PROOF_TX.slice(0, 10)}…{X402_PROOF_TX.slice(-8)}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 4 }}>
                  Payment: Base mainnet · Execution: Base Sepolia
                </div>
              </div>
            </div>
            <a
              href={baseMainnetTxUrl(X402_PROOF_TX)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 12, color: "#34d399", textDecoration: "none", display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}
            >
              BaseScan <ExternalLink size={12} />
            </a>
          </div>
        ) : null}

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
              <a
                href={row.href}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 12, color: "#34d399", textDecoration: "none", display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}
              >
                Open <ExternalLink size={12} />
              </a>
            </div>
          );
        })}

        <div
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
            <Link2 size={16} color="#818cf8" />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>HF-read workflow ID</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                Deep editor links require KeeperHub org login — copy ID or use marketplace above.
              </div>
              <div style={{ marginTop: 6 }}>
                <KeeperHubWorkflowLink workflowId={HF_READ_WORKFLOW_ID} compact />
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={copySlug}
            style={{
              fontSize: 12,
              color: "#94a3b8",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "6px 10px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontWeight: 600,
            }}
          >
            {copiedSlug ? <Check size={12} color="#34d399" /> : <Copy size={12} />}
            Copy slug
          </button>
        </div>
      </div>
    </div>
  );
}
