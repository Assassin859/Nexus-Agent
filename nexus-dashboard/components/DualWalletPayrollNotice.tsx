"use client";

import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { proxyFetch } from "@/lib/agent-fetch";

type PortfolioDualWallet = {
  sameWallet?: boolean;
  signerWallet?: string | null;
};

export default function DualWalletPayrollNotice() {
  const { walletAddress, authToken } = useWallet();
  const [info, setInfo] = useState<PortfolioDualWallet | null>(null);

  useEffect(() => {
    let cancelled = false;
    proxyFetch(`/api/portfolio/${walletAddress}`, {}, authToken)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setInfo({ sameWallet: data.sameWallet, signerWallet: data.signerWallet });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [walletAddress, authToken]);

  if (!info || info.sameWallet !== false || !info.signerWallet) {
    return null;
  }

  const short = `${info.signerWallet.slice(0, 6)}…${info.signerWallet.slice(-4)}`;

  return (
    <div
      style={{
        background: "rgba(99,102,241,0.08)",
        border: "1px solid rgba(99,102,241,0.28)",
        borderRadius: 10,
        padding: "10px 14px",
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        color: "#a5b4fc",
        fontSize: 12,
        lineHeight: 1.45,
      }}
    >
      <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>
        <strong>Dual-wallet mode:</strong> PayChain payroll USDC is debited from the agentic MPC wallet (
        <span style={{ fontFamily: "monospace" }}>{short}</span>), not your MetaMask monitored wallet. Guardian
        repays use <code>onBehalfOf</code>; yield rotates require the same wallet.
      </span>
    </div>
  );
}
