"use client";

import { useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { proxyFetch } from "@/lib/agent-fetch";
import { HF_READ_SLUG, MARKETPLACE_URL } from "@/lib/tier2-proofs";

type HfReadResult = {
  healthFactor: number | null;
  totalCollateralUSD: number;
  totalDebtUSD: number;
  source: "keeperhub_marketplace" | "local_aave_read";
  listing402?: boolean;
  _unauthorized?: boolean;
  _forbidden?: boolean;
  error?: string;
};

export default function HfReadWidget() {
  const { walletAddress, authToken } = useWallet();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HfReadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const badge = (() => {
    if (loading) return { label: "Loading", className: "pill pill-cyan" };
    if (!result) return null;
    if (result.listing402 || result.source === "local_aave_read") {
      return { label: "Local read (x402 listing)", className: "pill pill-warning" };
    }
    return { label: "KeeperHub listing", className: "pill pill-success" };
  })();

  const query = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await proxyFetch(
        "/api/marketplace/hf-read",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress }),
        },
        authToken,
      );
      const json = (await res.json()) as HfReadResult;
      if (res.status === 401) {
        setError("Sign in to query HF via marketplace");
        setResult(null);
        return;
      }
      if (!res.ok) {
        setError(json.error || "HF read failed");
        setResult(null);
        return;
      }
      setResult(json);
    } catch {
      setError("Network error — agent unreachable");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        marginTop: 16,
        padding: "14px 16px",
        borderRadius: 10,
        background: "rgba(99,102,241,0.06)",
        border: "1px solid rgba(99,102,241,0.2)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Marketplace HF-read</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
            Calls <code style={{ fontSize: 10.5 }}>{HF_READ_SLUG}</code> — falls back to local Aave on 402
          </div>
        </div>
        {badge && <span className={badge.className} style={{ fontSize: 10.5 }}>{badge.label}</span>}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={query}
          disabled={loading}
          className="btn btn-primary"
          style={{ padding: "8px 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}
        >
          <RefreshCw size={13} />
          {loading ? "Querying…" : "Query HF via Marketplace"}
        </button>
        <a
          href={MARKETPLACE_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 12, color: "#818cf8", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}
        >
          Marketplace <ExternalLink size={12} />
        </a>
      </div>

      {error && (
        <div style={{ marginTop: 10, fontSize: 12, color: "#f87171" }}>{error}</div>
      )}

      {result && !error && (
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600 }}>Health Factor</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#34d399" }}>
              {result.healthFactor !== null ? result.healthFactor.toFixed(2) : "—"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600 }}>Collateral</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>${result.totalCollateralUSD.toLocaleString()}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600 }}>Debt</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>${result.totalDebtUSD.toLocaleString()}</div>
          </div>
        </div>
      )}
    </div>
  );
}
