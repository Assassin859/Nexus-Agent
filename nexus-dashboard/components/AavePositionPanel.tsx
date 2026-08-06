"use client";

import { useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, Landmark, LogOut, Info } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { proxyFetch } from "@/lib/agent-fetch";

type Action = "supply" | "borrow" | "repay" | "withdraw";

type Preview = {
  ok: boolean;
  action: Action;
  amountUSD: number;
  healthFactorBefore: number | null;
  debtUSD: number;
  collateralUSD: number;
  availableBorrowsUSD: number;
  agenticUsdcBalance: number;
  sameWallet: boolean;
  warnings: string[];
  blocked?: boolean;
  blockReason?: string;
  estimatedHealthFactorAfter?: number | null;
};

type Props = {
  healthFactor: number | null;
  debtUSD: number;
  collateralUSD: number;
  availableBorrowsUSD: number;
  sameWallet: boolean;
};

const ACTIONS: { id: Action; label: string; icon: typeof Landmark }[] = [
  { id: "supply", label: "Supply", icon: ArrowUpCircle },
  { id: "borrow", label: "Borrow", icon: ArrowDownCircle },
  { id: "repay", label: "Repay", icon: Landmark },
  { id: "withdraw", label: "Withdraw", icon: LogOut },
];

export default function AavePositionPanel({
  healthFactor,
  debtUSD,
  collateralUSD,
  availableBorrowsUSD,
  sameWallet,
}: Props) {
  const { authToken, isConnected } = useWallet();
  const [action, setAction] = useState<Action>("supply");
  const [amount, setAmount] = useState("25");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const actionDisabled = (a: Action): string | null => {
    if (!isConnected || !authToken) return "Sign in with Ethereum to use manual Aave controls.";
    if (a === "repay" && debtUSD < 1) return "No debt to repay.";
    if (a === "borrow" && availableBorrowsUSD < 1) return "No borrow capacity available.";
    return null;
  };

  async function runPreview() {
    setLoading(true);
    setError(null);
    setMessage(null);
    setPreview(null);
    try {
      const amountUSD = parseFloat(amount);
      if (!Number.isFinite(amountUSD) || amountUSD < 1) {
        setError("Enter an amount of at least $1 USDC.");
        return;
      }
      const res = await proxyFetch(
        "/api/aave/preview",
        {
          method: "POST",
          body: JSON.stringify({ action, amountUSD }),
        },
        authToken,
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Preview failed");
        return;
      }
      setPreview(data);
      if (data.blocked) setError(data.blockReason ?? "Action blocked");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  }

  async function runConfirm() {
    if (!preview || preview.blocked) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await proxyFetch(
        "/api/aave/action",
        {
          method: "POST",
          body: JSON.stringify({
            action: preview.action,
            amountUSD: preview.amountUSD,
            confirm: true,
          }),
        },
        authToken,
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Execution failed");
        return;
      }
      if (data.success) {
        setMessage(data.message ?? "Transaction submitted.");
        setPreview(null);
      } else {
        setError(data.message ?? "Execution failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Execution failed");
    } finally {
      setLoading(false);
    }
  }

  if (!isConnected) {
    return (
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700 }}>Aave Position Controls</h3>
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
          Sign in with Ethereum and sync your KeeperHub API key to supply, borrow, repay, or withdraw on Aave V3.
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700 }}>Aave Position Controls</h3>
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>
          Manual supply / borrow / repay / withdraw via KeeperHub MCP. USDC debits from the agentic MPC wallet.
        </p>
      </div>

      {!sameWallet && (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
            fontSize: 12,
            color: "#a5b4fc",
            background: "rgba(99,102,241,0.08)",
            border: "1px solid rgba(99,102,241,0.25)",
            borderRadius: 8,
            padding: "10px 12px",
          }}
        >
          <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            Dual-wallet: supply and repay use <code>onBehalfOf</code> your monitored wallet. Borrow may need credit
            delegation; withdraw uses agentic Aave supply only.
          </span>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {ACTIONS.map(({ id, label, icon: Icon }) => {
          const disabledReason = actionDisabled(id);
          const active = action === id;
          return (
            <button
              key={id}
              type="button"
              disabled={!!disabledReason && id !== action}
              title={disabledReason ?? undefined}
              onClick={() => {
                setAction(id);
                setPreview(null);
                setError(null);
                setMessage(null);
              }}
              className="btn"
              style={{
                opacity: disabledReason && !active ? 0.45 : 1,
                background: active ? "rgba(52,211,153,0.15)" : undefined,
                borderColor: active ? "rgba(52,211,153,0.4)" : undefined,
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
              }}
            >
              <Icon size={14} />
              {label}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: 13, color: "var(--text-2)" }}>
          Amount (USDC)
          <input
            type="number"
            min={1}
            step={1}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setPreview(null);
            }}
            style={{
              display: "block",
              marginTop: 4,
              width: 120,
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
            }}
          />
        </label>
        <button
          type="button"
          className="btn btn-primary"
          disabled={loading || !!actionDisabled(action)}
          onClick={runPreview}
          style={{ marginTop: 20 }}
        >
          {loading && !preview ? "Loading…" : "Preview"}
        </button>
      </div>

      {preview && !preview.blocked && (
        <div
          style={{
            fontSize: 12,
            background: "rgba(15,23,42,0.6)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div>
            <strong>{preview.action}</strong> ${preview.amountUSD.toFixed(2)} USDC
          </div>
          <div>
            HF {preview.healthFactorBefore?.toFixed(2) ?? "—"}
            {preview.estimatedHealthFactorAfter != null &&
              ` → est. ${preview.estimatedHealthFactorAfter.toFixed(2)}`}
          </div>
          <div>Debt ${preview.debtUSD.toFixed(0)} · Collateral ${preview.collateralUSD.toFixed(0)}</div>
          <div>Agentic USDC ${preview.agenticUsdcBalance.toFixed(2)}</div>
          {preview.warnings.map((w) => (
            <div key={w} style={{ color: "#fbbf24" }}>
              ⚠ {w}
            </div>
          ))}
          <button
            type="button"
            className="btn btn-primary"
            disabled={loading}
            onClick={runConfirm}
            style={{ marginTop: 8, alignSelf: "flex-start" }}
          >
            {loading ? "Executing…" : "Confirm & Execute"}
          </button>
        </div>
      )}

      {error && (
        <p style={{ margin: 0, fontSize: 13, color: "#f87171" }}>{error}</p>
      )}
      {message && (
        <p style={{ margin: 0, fontSize: 13, color: "#34d399" }}>{message}</p>
      )}

      <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>
        Live: HF {healthFactor?.toFixed(2) ?? "—"} · Debt ${debtUSD.toLocaleString()} · Borrow room $
        {availableBorrowsUSD.toLocaleString()}
        {!sameWallet && " · Manual supply/repay share pending locks with Guardian cron."}
      </p>
    </div>
  );
}
