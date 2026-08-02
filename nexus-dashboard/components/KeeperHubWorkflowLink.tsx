"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import {
  KEEPERHUB_WORKFLOW_LOGIN_HINT,
  keeperHubWorkflowUrl,
} from "@/lib/keeperhub-links";

type Props = {
  workflowId: string;
  /** Shorter copy label for dense tables */
  compact?: boolean;
  /** Footer-style single link row */
  variant?: "inline" | "footer";
};

export default function KeeperHubWorkflowLink({
  workflowId,
  compact = false,
  variant = "inline",
}: Props) {
  const [copied, setCopied] = useState(false);
  const url = keeperHubWorkflowUrl(workflowId);
  if (!url) return null;

  function copyId() {
    navigator.clipboard.writeText(workflowId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const idLabel = compact
    ? `${workflowId.slice(0, 8)}…${workflowId.slice(-4)}`
    : workflowId;

  if (variant === "footer") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={copyId}
          title="Copy workflow ID"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            background: "none",
            border: "none",
            color: "#94a3b8",
            fontWeight: 600,
            fontSize: 12,
            cursor: "pointer",
            fontFamily: "ui-monospace, monospace",
            padding: 0,
          }}
        >
          {copied ? <Check size={12} color="#34d399" /> : <Copy size={12} />}
          {idLabel}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title={KEEPERHUB_WORKFLOW_LOGIN_HINT}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            color: "#818cf8",
            fontWeight: 600,
            fontSize: 12,
            textDecoration: "none",
          }}
        >
          KeeperHub editor <ExternalLink size={12} />
          <span style={{ fontSize: 10, color: "#64748b", fontWeight: 500 }}>(org login)</span>
        </a>
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={copyId}
        title="Copy workflow ID"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          color: "var(--text-muted)",
          fontWeight: 600,
          fontSize: compact ? 11 : 12,
          cursor: "pointer",
          fontFamily: "ui-monospace, monospace",
          padding: compact ? "2px 6px" : "4px 8px",
        }}
      >
        {copied ? <Check size={11} color="#34d399" /> : <Copy size={11} />}
        {idLabel}
      </button>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={KEEPERHUB_WORKFLOW_LOGIN_HINT}
        style={{
          fontSize: compact ? 11 : 12,
          color: "#818cf8",
          fontWeight: 600,
          textDecoration: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        Editor <ExternalLink size={11} />
      </a>
    </span>
  );
}
