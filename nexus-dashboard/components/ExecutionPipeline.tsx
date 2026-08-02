"use client";

import { PIPELINE_STEPS, getExecutionPipeline } from "@/lib/execution-pipeline";
import type { TransactionStatus } from "@/components/TransactionCard";

type Props = {
  status: TransactionStatus;
  action: string;
  txHash?: string;
};

export default function ExecutionPipeline({ status, action, txHash }: Props) {
  const { activeStep, failedAt, outcome } = getExecutionPipeline(status, action, txHash);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 8,
        padding: "10px 12px",
        borderRadius: 8,
        background: "rgba(255,255,255,0.02)",
        border: "1px solid var(--border)",
      }}
    >
      {PIPELINE_STEPS.map((step, idx) => {
        const isFailed = failedAt === idx;
        const isComplete = idx < activeStep || (idx === activeStep && !failedAt && activeStep === 3);
        const isCurrent = idx === activeStep && !isComplete && !isFailed;
        const isInactive = idx > activeStep && !isFailed;

        let circleBg = "rgba(255,255,255,0.06)";
        let circleColor = "var(--text-muted)";
        let labelColor = "var(--text-muted)";

        if (isFailed) {
          circleBg = "rgba(239,68,68,0.15)";
          circleColor = "#fb7185";
          labelColor = "#fb7185";
        } else if (isComplete) {
          circleBg = "rgba(99,102,241,0.2)";
          circleColor = "#818cf8";
          labelColor = "var(--text)";
        } else if (isCurrent) {
          circleBg = "rgba(99,102,241,0.35)";
          circleColor = "#c7d2fe";
          labelColor = "var(--text)";
        }

        return (
          <div key={step} style={{ display: "flex", alignItems: "center", gap: 6, flex: "1 1 auto", minWidth: 0 }}>
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: 800,
                background: circleBg,
                color: circleColor,
                opacity: isInactive ? 0.45 : 1,
              }}
            >
              {idx + 1}
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: isComplete || isCurrent || isFailed ? 700 : 500,
                color: isInactive ? "var(--text-muted)" : labelColor,
                whiteSpace: "nowrap",
              }}
            >
              {step}
            </span>
            {idx < PIPELINE_STEPS.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: 1,
                  minWidth: 8,
                  marginLeft: 4,
                  background: idx < activeStep && !isFailed ? "rgba(129,140,248,0.35)" : "rgba(255,255,255,0.08)",
                  opacity: isInactive ? 0.4 : 1,
                }}
              />
            )}
          </div>
        );
      })}
      {outcome && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#94a3b8",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            flexShrink: 0,
          }}
        >
          {outcome}
        </span>
      )}
    </div>
  );
}
