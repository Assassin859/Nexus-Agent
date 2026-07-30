"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWallet } from "@/context/WalletContext";

import { Suspense } from "react";

function CallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { handleKeeperHubCallback } = useWallet();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    const token = searchParams.get("token");
    const email = searchParams.get("email") || undefined;
    const error = searchParams.get("error");

    if (error) {
      setStatus("error");
      return;
    }

    if (token) {
      handleKeeperHubCallback(token, email);
      setStatus("success");
      // Redirect back to workflows after 1.5s
      setTimeout(() => router.push("/workflows"), 1500);
    } else {
      setStatus("error");
    }
  }, [searchParams, handleKeeperHubCallback, router]);

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--bg)", flexDirection: "column", gap: 16
    }}>
      {status === "loading" && (
        <>
          <div style={{ width: 44, height: 44, borderRadius: "50%", border: "3px solid rgba(99,102,241,0.3)", borderTop: "3px solid #818cf8", animation: "spin 0.8s linear infinite" }} />
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Connecting KeeperHub account...</p>
        </>
      )}
      {status === "success" && (
        <>
          <div style={{ fontSize: 40 }}>✅</div>
          <p style={{ color: "#34d399", fontSize: 16, fontWeight: 700 }}>KeeperHub Connected!</p>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Redirecting to workflows...</p>
        </>
      )}
      {status === "error" && (
        <>
          <div style={{ fontSize: 40 }}>❌</div>
          <p style={{ color: "#f87171", fontSize: 16, fontWeight: 700 }}>Authentication Failed</p>
          <button onClick={() => router.push("/")} className="btn btn-primary" style={{ marginTop: 8 }}>
            Go Home
          </button>
        </>
      )}
    </div>
  );
}

export default function KeeperHubCallbackPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      </div>
    }>
      <CallbackInner />
    </Suspense>
  );
}
