"use client";

import { ExternalLink, Copy, Check } from "lucide-react";
import { useState } from "react";
import {
  TEMPO_CHAIN_ID,
  TEMPO_PROOF_TXS,
  keeperHubWorkflowUrl,
  tempoTxUrl,
} from "@/lib/tier2-proofs";

export default function TempoProofTable() {
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
          On-chain proofs ({TEMPO_PROOF_TXS.length})
        </h3>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.55 }}>
          Public attestation via{" "}
          <a href="https://explore.testnet.tempo.xyz" target="_blank" rel="noopener noreferrer" style={{ color: "#06b6d4" }}>
            Tempo Explorer
          </a>
          . KeeperHub workflow links open in your org; deep execution URLs are not shareable (404 for external viewers).
        </p>
      </div>

      <table className="kh-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Tx hash</th>
            <th>Memo</th>
            <th>Links</th>
          </tr>
        </thead>
        <tbody>
          {[...TEMPO_PROOF_TXS].reverse().map((proof, idx) => {
            const n = TEMPO_PROOF_TXS.length - idx;
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
                <td style={{ fontSize: 12, color: "var(--text-muted)" }}>nexus-agent-proof</td>
                <td>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <a
                      href={tempoTxUrl(proof.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 12, color: "#f59e0b", fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
                    >
                      Tempo Explorer <ExternalLink size={11} />
                    </a>
                    <a
                      href={keeperHubWorkflowUrl(proof.workflowId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 12, color: "#818cf8", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
                      title="Requires Nexus Agent org on KeeperHub"
                    >
                      Workflow <ExternalLink size={11} />
                    </a>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ marginTop: 14, fontSize: 11, color: "var(--text-muted)" }}>
        Chain ID {TEMPO_CHAIN_ID} · Action: <code style={{ fontSize: 10.5 }}>tempo/transfer-with-memo</code> · PathUSD fees (no ETH gas)
      </div>
    </div>
  );
}
