"use client";

import clsx from "clsx";
import { ShieldCheck, AlertTriangle, ShieldAlert } from "lucide-react";

type HealthGaugeProps = {
  value: number;
  label?: string;
  size?: number;
};

export default function HealthGauge({ value, label = "Aave V3 Health Factor", size = 240 }: HealthGaugeProps) {
  const minVal = 0.5;
  const maxVal = 3.0;
  const clampedVal = Math.min(Math.max(value, minVal), maxVal);

  const radius = (size - 36) / 2;
  const circumference = Math.PI * radius;
  const progress = (clampedVal - minVal) / (maxVal - minVal);
  const strokeDashoffset = circumference * (1 - progress);

  let statusColor = "#10b981"; // Emerald
  let statusText = "Safe Position";
  let StatusIcon = ShieldCheck;

  if (value < 1.15) {
    statusColor = "#f43f5e"; // Rose / Danger
    statusText = "Liquidation Risk";
    StatusIcon = ShieldAlert;
  } else if (value < 1.40) {
    statusColor = "#f59e0b"; // Amber / Warning
    statusText = "Warning Zone";
    StatusIcon = AlertTriangle;
  }

  return (
    <div
      className={clsx(
        "kh-card flex flex-col items-center justify-center p-8 text-center relative overflow-hidden",
        value < 1.15 && "border-rose-500/50 shadow-rose-500/20"
      )}
    >
      {/* Background Radial Glow */}
      <div
        className="absolute w-48 h-48 rounded-full blur-3xl opacity-20 pointer-events-none -top-12"
        style={{ background: statusColor }}
      />

      <div className="relative flex items-center justify-center" style={{ width: size, height: size / 1.55 }}>
        <svg width={size} height={size / 2 + 24} className="overflow-visible">
          {/* Track Arc */}
          <path
            d={`M 18 ${size / 2 + 12} A ${radius} ${radius} 0 0 1 ${size - 18} ${size / 2 + 12}`}
            fill="none"
            stroke="rgba(255, 255, 255, 0.07)"
            strokeWidth="18"
            strokeLinecap="round"
          />
          {/* Progress Arc */}
          <path
            d={`M 18 ${size / 2 + 12} A ${radius} ${radius} 0 0 1 ${size - 18} ${size / 2 + 12}`}
            fill="none"
            stroke={statusColor}
            strokeWidth="18"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{
              transition: "stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.4s ease",
              filter: `drop-shadow(0 0 10px ${statusColor}80)`
            }}
          />
        </svg>

        {/* Center Display Value */}
        <div className="absolute bottom-2 flex flex-col items-center">
          <span className="font-heading font-black text-5xl tracking-tight" style={{ color: statusColor }}>
            {value.toFixed(2)}
          </span>
          <span className="text-xs text-[var(--color-text-muted)] font-semibold mt-1 uppercase tracking-wider">{label}</span>
        </div>
      </div>

      {/* Status Pill Badge */}
      <div
        className="mt-6 inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold tracking-wide"
        style={{
          background: `${statusColor}18`,
          color: statusColor,
          border: `1px solid ${statusColor}40`,
        }}
      >
        <StatusIcon size={14} />
        <span>{statusText}</span>
      </div>
    </div>
  );
}
