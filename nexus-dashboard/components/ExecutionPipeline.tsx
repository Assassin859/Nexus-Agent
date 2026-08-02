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
    <div className="exec-pipeline">
      {PIPELINE_STEPS.map((step, idx) => {
        const isFailed = failedAt === idx;
        const isComplete =
          idx < activeStep || (idx === activeStep && !failedAt && activeStep === PIPELINE_STEPS.length - 1);
        const isCurrent = idx === activeStep && !isComplete && !isFailed;
        const isInactive = idx > activeStep && !isFailed;

        let stateClass = "exec-pipeline-step--inactive";
        if (isFailed) stateClass = "exec-pipeline-step--failed";
        else if (isComplete) stateClass = "exec-pipeline-step--complete";
        else if (isCurrent) stateClass = "exec-pipeline-step--current";

        return (
          <div
            key={step}
            className={`exec-pipeline-step ${stateClass}`}
            data-last={idx === PIPELINE_STEPS.length - 1 ? "true" : undefined}
          >
            <div className="exec-pipeline-track">
              <div className="exec-pipeline-dot">{idx + 1}</div>
              {idx < PIPELINE_STEPS.length - 1 && (
                <div
                  className="exec-pipeline-line"
                  data-filled={idx < activeStep && !isFailed ? "true" : undefined}
                />
              )}
            </div>
            <span className="exec-pipeline-label">{step}</span>
          </div>
        );
      })}
      {outcome && <span className="exec-pipeline-outcome">{outcome}</span>}
    </div>
  );
}
