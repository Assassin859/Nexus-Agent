"use client";

import clsx from "clsx";

type HealthGaugeProps = {
  value: number;
  label?: string;
  size?: number;
};

export default function HealthGauge({ value, label = "Health Factor", size = 220 }: HealthGaugeProps) {
  const minVal = 0.5;
  const maxVal = 3.0;
  const clampedVal = Math.min(Math.max(value, minVal), maxVal);

  const radius = (size - 30) / 2;
  const circumference = Math.PI * radius; // 180 deg arc
  const progress = (clampedVal - minVal) / (maxVal - minVal);
  const strokeDashoffset = circumference * (1 - progress);

  let statusColor = "var(--color-success)";
  let statusText = "Safe Position";

  if (value < 1.15) {
    statusColor = "var(--color-danger)";
    statusText = "Liquidation Risk";
  } else if (value < 1.40) {
    statusColor = "var(--color-warning)";
    statusText = "Warning Zone";
  }

  return (
    <div
      className={clsx(
        "glass flex flex-col items-center justify-center p-6 text-center transition-all duration-300",
        value < 1.15 && "critical-glow border-red-500/50"
      )}
    >
      <div className="relative flex items-center justify-center" style={{ width: size, height: size / 1.6 }}>
        <svg width={size} height={size / 2 + 20} className="overflow-visible">
          <path
            d={`M 15 ${size / 2 + 10} A ${radius} ${radius} 0 0 1 ${size - 15} ${size / 2 + 10}`}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth="16"
            strokeLinecap="round"
          />
          <path
            d={`M 15 ${size / 2 + 10} A ${radius} ${radius} 0 0 1 ${size - 15} ${size / 2 + 10}`}
            fill="none"
            stroke={statusColor}
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: "stroke-dashoffset 1s ease-in-out, stroke 0.3s ease" }}
          />
        </svg>

        <div className="absolute bottom-2 flex flex-col items-center">
          <span className="font-heading font-extrabold text-4xl tracking-tight" style={{ color: statusColor }}>
            {value.toFixed(2)}
          </span>
          <span className="text-xs text-[var(--color-text-muted)] font-medium mt-1">{label}</span>
        </div>
      </div>

      <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold" style={{ background: `${statusColor}20`, color: statusColor, border: `1px solid ${statusColor}40` }}>
        <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: statusColor }}></span>
        {statusText}
      </div>
    </div>
  );
}
