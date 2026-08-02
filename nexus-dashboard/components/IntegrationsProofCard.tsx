"use client";

import { ExternalLink, Link2, Store } from "lucide-react";
import Link from "next/link";
import { HF_READ_SLUG, HF_READ_WORKFLOW_ID, MARKETPLACE_URL, keeperHubWorkflowUrl } from "@/lib/tier2-proofs";

export default function IntegrationsProofCard() {
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
        </div>
      </div>

      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.5 }}>
        Tempo Moderato proofs live on the{" "}
        <Link href="/tempo" style={{ color: "#06b6d4", fontWeight: 600, textDecoration: "none" }}>
          Tempo page →
        </Link>
      </p>

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
      </div>
    </div>
  );
}
