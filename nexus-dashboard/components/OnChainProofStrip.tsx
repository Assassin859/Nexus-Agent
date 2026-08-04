"use client";

import { ExternalLink } from "lucide-react";
import {
  GUARDIAN_REPAY_PROOF_TXS,
  PAYROLL_PROOF_TXS,
  TEMPO_PROOF_TXS,
  X402_PROOF_TX,
  baseMainnetTxUrl,
  baseSepoliaTxUrl,
  tempoTxUrl,
} from "@/lib/tier2-proofs";

function shortHash(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

export default function OnChainProofStrip() {
  const payroll = PAYROLL_PROOF_TXS[0];
  const totalProofs =
    GUARDIAN_REPAY_PROOF_TXS.length + TEMPO_PROOF_TXS.length + PAYROLL_PROOF_TXS.length + 1;

  return (
    <div className="card" style={{ padding: "16px 18px" }}>
      <div style={{ marginBottom: 12 }}>
        <h3
          style={{
            fontFamily: "var(--font-space-grotesk), sans-serif",
            fontSize: 15,
            fontWeight: 800,
            color: "var(--text)",
            margin: 0,
          }}
        >
          On-chain proof links ({totalProofs})
        </h3>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0", lineHeight: 1.5 }}>
          Pinned BaseScan / Tempo Explorer links — verify without scrolling the decision log.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <ProofGroup
          title={`Guardian repays (${GUARDIAN_REPAY_PROOF_TXS.length})`}
          links={GUARDIAN_REPAY_PROOF_TXS.map((p) => ({
            label: `$${p.amountUSD} · ${shortHash(p.txHash)}`,
            href: baseSepoliaTxUrl(p.txHash),
          }))}
        />
        <ProofGroup
          title={`Tempo attestation (${TEMPO_PROOF_TXS.length})`}
          links={TEMPO_PROOF_TXS.map((p) => ({
            label: shortHash(p.txHash),
            href: tempoTxUrl(p.txHash),
          }))}
        />
        <ProofGroup
          title="PayChain + x402"
          links={[
            ...(payroll
              ? [{ label: `Payroll $${payroll.amountUSD} · ${shortHash(payroll.txHash)}`, href: baseSepoliaTxUrl(payroll.txHash) }]
              : []),
            { label: `x402 HF-read · ${shortHash(X402_PROOF_TX)}`, href: baseMainnetTxUrl(X402_PROOF_TX) },
          ]}
        />
      </div>
    </div>
  );
}

function ProofGroup({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 14px" }}>
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "#818cf8",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {link.label}
            <ExternalLink size={11} />
          </a>
        ))}
      </div>
    </div>
  );
}
