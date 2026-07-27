import { CheckCircle2, Clock, ShieldX } from "lucide-react";

export default function ResiliencePage() {
  return (
    <div className="flex flex-col gap-8 animate-fade-up">
      <div>
        <h1 className="section-title">Resilience & Simulation Log</h1>
        <p className="section-subtitle">Every action is simulated prior to broadcast. Zero gas wasted on reverts.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Column 1: Happy Path */}
        <div className="glass p-6 flex flex-col gap-4 border-l-4 border-l-emerald-500">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={24} className="text-emerald-400" />
            <div>
              <h3 className="font-heading font-bold text-base">Happy Path Run</h3>
              <span className="text-xs text-[var(--color-text-muted)] font-medium">Broadcast & Mined</span>
            </div>
          </div>
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
            Health Factor dropped to 1.12. Agent executed partial repayment of 500 USDC within physical wallet balance.
          </p>
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 font-mono">
            Status: SUCCESS (200 OK)
            <br />
            Gas Spent: $1.42
          </div>
        </div>

        {/* Column 2: Gas Adjusted Path */}
        <div className="glass p-6 flex flex-col gap-4 border-l-4 border-l-amber-500">
          <div className="flex items-center gap-3">
            <Clock size={24} className="text-amber-400" />
            <div>
              <h3 className="font-heading font-bold text-base">Gas Adjusted Path</h3>
              <span className="text-xs text-[var(--color-text-muted)] font-medium">Delayed Execution</span>
            </div>
          </div>
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
            DCA swap requested ($100 USDC). Gas estimate ($8.50) exceeded 5% safety threshold. Delayed for 60 minutes.
          </p>
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-400 font-mono">
            Status: PAUSED (Gas Cap)
            <br />
            Next Check: In 60m
          </div>
        </div>

        {/* Column 3: Caught Revert */}
        <div className="glass p-6 flex flex-col gap-4 border-l-4 border-l-red-500">
          <div className="flex items-center gap-3">
            <ShieldX size={24} className="text-red-400" />
            <div>
              <h3 className="font-heading font-bold text-base">Caught Revert</h3>
              <span className="text-xs text-[var(--color-text-muted)] font-medium">Pre-Flight Intercept</span>
            </div>
          </div>
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
            Payroll action simulated onchain. Simulation engine detected missing token allowance. Action aborted before broadcast.
          </p>
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400 font-mono">
            Status: ABORTED (Sim Revert)
            <br />
            Gas Wasted: $0.00
          </div>
        </div>
      </div>
    </div>
  );
}
