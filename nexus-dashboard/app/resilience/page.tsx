import { CheckCircle2, Clock, ShieldX } from "lucide-react";

export default function ResiliencePage() {
  return (
    <div className="flex flex-col gap-8 animate-slide-up">
      <div>
        <h1 className="heading-title">Resilience & Simulation Log</h1>
        <p className="heading-subtitle">Every action is simulated prior to broadcast. Zero gas wasted on reverts.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Column 1: Happy Path */}
        <div className="glass-card p-6 flex flex-col justify-between gap-6 border-l-4 border-l-emerald-500">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <CheckCircle2 size={22} />
              </div>
              <div>
                <h3 className="font-heading font-bold text-lg text-white">Happy Path Run</h3>
                <span className="status-pill status-pill-success mt-1">Broadcast & Mined</span>
              </div>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed font-medium">
              Health Factor dropped to 1.12. Agent executed partial repayment of 500 USDC within physical wallet balance limits.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 font-mono font-medium">
            Status: SUCCESS (200 OK)
            <br />
            Gas Spent: $1.42
          </div>
        </div>

        {/* Column 2: Gas Adjusted Path */}
        <div className="glass-card p-6 flex flex-col justify-between gap-6 border-l-4 border-l-amber-500">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Clock size={22} />
              </div>
              <div>
                <h3 className="font-heading font-bold text-lg text-white">Gas Adjusted Path</h3>
                <span className="status-pill status-pill-warning mt-1">Delayed Execution</span>
              </div>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed font-medium">
              DCA swap requested ($100 USDC). Gas estimate ($8.50) exceeded 5% safety threshold. Delayed for 60 minutes.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 font-mono font-medium">
            Status: PAUSED (Gas Cap)
            <br />
            Next Check: In 60m
          </div>
        </div>

        {/* Column 3: Caught Revert */}
        <div className="glass-card p-6 flex flex-col justify-between gap-6 border-l-4 border-l-rose-500">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                <ShieldX size={22} />
              </div>
              <div>
                <h3 className="font-heading font-bold text-lg text-white">Caught Revert</h3>
                <span className="status-pill status-pill-danger mt-1">Pre-Flight Intercept</span>
              </div>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed font-medium">
              Payroll action simulated onchain. Simulation engine detected missing token allowance. Action aborted before broadcast.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 font-mono font-medium">
            Status: ABORTED (Sim Revert)
            <br />
            Gas Wasted: $0.00
          </div>
        </div>
      </div>
    </div>
  );
}
