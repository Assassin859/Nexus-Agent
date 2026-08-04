"use client";

import { ExternalLink, Copy, Check } from "lucide-react";
import { useState } from "react";
import { GUARDIAN_REPAY_PROOF_TXS } from "@/lib/tier2-proofs";

function baseSepoliaTxUrl(txHash: string): string {
  return `https://sepolia.basescan.org/tx/${txHash}`;
}

export default function GuardianRepayProofTable() {
  const [copied, setCopied] = useState<string | null>(null);

  function copyHash(hash: string) {
    navigator.clipboard.writeText(hash);
    setCopied(hash);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="card">
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontFamily: "var(--font-space-grotesk), sans-serif", fontSize: 17, fontWeight: 800, color: "var(--text)", margin: 0 }}>
          Guardian repay proofs ({GUARDIAN_REPAY_PROOF_TXS.length})
        </h3>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.55 }}>
          Mined Aave V3 repays on Base Sepolia. New repays show an independent Aave RPC check on the Feed.
        </p>
      </div>

      <table className="kh-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Tx hash</th>
            <th>Amount</th>
            <th>Links</th>
          </tr>
        </thead>
        <tbody>
          {[...GUARDIAN_REPAY_PROOF_TXS].reverse().map((proof, idx) => {
            const n = GUARDIAN_REPAY_PROOF_TXS.length - idx;
            return (
              <tr key={proof.txHash}>
                <td className="cell-bold">{n}</td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "monospace", fontSize: 11 }}>
                    <span style={{ color: "var(--text-muted)" }}>
                      {proof.txHash.slice(0, 10)}…{proof.txHash.slice(-8)}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyHash(proof.txHash)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: copied === proof.txHash ? "#34d399" : "var(--text-muted)", padding: 0, display: "flex" }}
                      title="Copy full hash"
                    >
                      {copied === proof.txHash ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                </td>
                <td style={{ fontSize: 12, color: "var(--text-muted)" }}>${proof.amountUSD} USDC</td>
                <td>
                  <a
                    href={baseSepoliaTxUrl(proof.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 12, color: "#818cf8", fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
                  >
                    BaseScan <ExternalLink size={11} />
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
