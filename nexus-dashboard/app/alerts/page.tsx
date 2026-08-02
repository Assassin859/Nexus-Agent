"use client";

import { useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { proxyFetch } from "@/lib/agent-fetch";
import Pagination from "@/components/Pagination";
import { usePagination } from "@/hooks/usePagination";

type LogItem = {
  action: string;
  amount: number;
  status: string;
  reason?: string;
  timestamp?: string;
};

type AlertCardData = {
  type: "danger" | "warning" | "success" | "info";
  title: string;
  message: string;
  time: string;
};

const COLOR: Record<string, { bg: string; color: string; border: string }> = {
  danger:  { bg: "rgba(244,63,94,0.10)",  color: "#fb7185", border: "rgba(244,63,94,0.45)" },
  warning: { bg: "rgba(245,158,11,0.10)", color: "#fbbf24", border: "rgba(245,158,11,0.45)" },
  success: { bg: "rgba(34,197,94,0.10)",  color: "#34d399", border: "rgba(34,197,94,0.45)" },
  info:    { bg: "rgba(99,102,241,0.10)", color: "#818cf8", border: "rgba(99,102,241,0.45)" },
};

const PAGE_SIZE = 10;

export default function AlertsPage() {
  const { walletAddress: wallet, authToken } = useWallet();
  const [alerts, setAlerts] = useState<AlertCardData[]>([]);
  const [loading, setLoading] = useState(true);

  const { page, setPage, totalPages, pagedItems, total, showPagination } = usePagination(
    alerts,
    PAGE_SIZE,
    [wallet],
  );

  useEffect(() => {
    async function loadAlerts() {
      try {
        const res = await proxyFetch(`/api/feed/${wallet}`, {}, authToken);
        const data: LogItem[] = await res.json();
        if (Array.isArray(data)) {
          const parsed: AlertCardData[] = data.map((item) => {
            const isDanger = item.status === "reverted_chain" || item.status === "failed";
            const isWarning = item.status === "reverted_simulation" || item.status === "delayed" || item.action === "block_transaction";
            const isSuccess = item.status === "success" && (item.action === "repay" || item.action === "supply_collateral" || item.action === "rotate" || item.action === "swap");

            let type: "danger" | "warning" | "success" | "info";
            if (isDanger) type = "danger";
            else if (isWarning) type = "warning";
            else if (isSuccess) type = "success";
            else type = "info";

            return {
              type,
              title: `${item.action.toUpperCase()} Execution Logged (${item.status})`,
              message: item.reason || `Action ${item.action} with amount ${item.amount} USDC processed.`,
              time: item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : "Recent",
            };
          });
          setAlerts(parsed);
        }
      } catch (err) {
        console.error("Failed to load alerts:", err);
      } finally {
        setLoading(false);
      }
    }
    loadAlerts();
  }, [wallet, authToken]);

  return (
    <div className="animate-in" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div className="page-header">
        <h1 className="page-title">Alerts &amp; Notifications</h1>
        <p className="page-subtitle">Automated logging of risk events, limit hits, and execution status</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {loading ? (
          <div className="card" style={{ color: "var(--text-muted)", textAlign: "center", padding: 30 }}>
            Loading alert notifications...
          </div>
        ) : alerts.length === 0 ? (
          <div className="card" style={{ color: "var(--text-muted)", textAlign: "center", padding: 30 }}>
            No alert notifications logged. The system is operating normally.
          </div>
        ) : (
          <>
            {showPagination && (
              <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
            )}
            {pagedItems.map((alert, i) => {
              const c = COLOR[alert.type] || COLOR.info;
              return (
                <div
                  key={`${page}-${i}`}
                  className="alert-card"
                  style={{ borderLeftColor: c.border, borderLeftWidth: 3 }}
                >
                  <div
                    className="alert-icon"
                    style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}` }}
                  >
                    {alert.type === "danger"  && <AlertCircle size={20} />}
                    {alert.type === "warning" && <AlertTriangle size={20} />}
                    {alert.type === "info"    && <Info size={20} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div className="alert-title">{alert.title}</div>
                      <span className="alert-time">{alert.time}</span>
                    </div>
                    <p className="alert-msg">{alert.message}</p>
                  </div>
                </div>
              );
            })}
            {showPagination && (
              <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
