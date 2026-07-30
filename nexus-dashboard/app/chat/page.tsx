"use client";

import { useState, useEffect, useRef } from "react";
import { Send, Bot, User, Sparkles, Cpu } from "lucide-react";
import { useWallet } from "@/context/WalletContext";
import { proxyFetch } from "@/lib/agent-fetch";

type PortfolioData = {
  healthFactor: number | null;
  isError?: boolean;
  errorReason?: string;
  workflows: any[];
};

type ToolCall = { toolName: string; args?: Record<string, unknown> };
type ToolResult = { toolName: string; result?: unknown };

const DEFAULT_WELCOME = {
  sender: "agent",
  text: "Hello! I am your NexusAgent AI assistant powered by GitHub Models. How can I assist with your automated wealth strategy today?",
};

export default function ChatPage() {
  const { walletAddress, authToken, signInWithEthereum } = useWallet();

  const [messages, setMessages] = useState<Array<{ sender: string; text: string; toolCalls?: ToolCall[]; toolResults?: ToolResult[] }>>([DEFAULT_WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const isLoadedRef = useRef(false);

  // 1. Load chat history and check for pending template prompt on client mount safely
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("nexus_chat_history");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setMessages(parsed);
          }
        } catch {}
      }
      isLoadedRef.current = true;

      const pendingPrompt = sessionStorage.getItem("pending_chat_prompt");
      if (pendingPrompt) {
        setInput(pendingPrompt);
        sessionStorage.removeItem("pending_chat_prompt");
      }
    }
  }, []);

  // 2. Save chat history ONLY after initial mount load completes
  useEffect(() => {
    if (typeof window !== "undefined" && isLoadedRef.current && messages.length > 0) {
      localStorage.setItem("nexus_chat_history", JSON.stringify(messages));
    }
  }, [messages]);

  useEffect(() => {
    if (!walletAddress) return;
    proxyFetch(`/api/portfolio/${walletAddress}`, {}, authToken)
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          setPortfolio({
            healthFactor: typeof data.healthFactor === "number" ? data.healthFactor : null,
            isError: data.isError ?? false,
            errorReason: data.errorReason,
            workflows: data.workflows || [],
          });
        }
      })
      .catch(() => {});
  }, [walletAddress, authToken]);

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userText = input.trim();
    const userMsg = { sender: "user", text: userText };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const conversationHistory = messages.map((m) => ({
      sender: m.sender,
      text: m.text,
    }));

    try {
      const res = await proxyFetch(
        "/api/chat",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: userText,
            conversationHistory,
            walletAddress,
          }),
        },
        authToken
      );

      const data = await res.json();
      const agentMsg = {
        sender: "agent",
        text: data.reply || "Position evaluated. Health Factor is in safe bounds.",
        toolCalls: (data.toolCalls || []) as ToolCall[],
        toolResults: (data.toolResults || data.executionResults || []) as ToolResult[],
      };
      setMessages((prev) => [...prev, agentMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { sender: "agent", text: "Error communicating with backend agent server." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function clearHistory() {
    localStorage.removeItem("nexus_chat_history");
    setMessages([DEFAULT_WELCOME]);
  }

  const isPortfolioError = portfolio?.isError ?? false;
  const hasNoLoan = !isPortfolioError && portfolio !== null && portfolio.healthFactor === null;
  const hf = typeof portfolio?.healthFactor === "number" ? portfolio.healthFactor : null;
  const isSafe = hf !== null ? hf > 1.3 : true;
  const activeWorkflowsCount = portfolio?.workflows?.filter((w) => w.status === "active").length ?? 0;
  const lastWorkflow = portfolio?.workflows && portfolio.workflows.length > 0
    ? portfolio.workflows[portfolio.workflows.length - 1]
    : null;

  // Sidebar health factor display
  const hfDisplay = isPortfolioError
    ? "Degraded"
    : hasNoLoan
    ? "No Loan"
    : hf !== null && hf > 90
    ? "∞"
    : hf !== null
    ? hf.toFixed(2)
    : "—";
  const hfLabel = isPortfolioError
    ? "RPC Error"
    : hasNoLoan
    ? "No Active Loan"
    : isSafe
    ? "Safe Zone"
    : "Risk Zone";
  const hfColor = isPortfolioError ? "#f59e0b" : hasNoLoan ? "#64748b" : isSafe ? "#34d399" : "#f87171";

  return (
    <div className="animate-in" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title">AI Assistant &amp; Natural Language Command Center</h1>
          <p className="page-subtitle">Interact with the GitHub Models decision engine with full conversational memory</p>
        </div>
        <button
          onClick={clearHistory}
          className="btn"
          style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171", fontSize: 12 }}
        >
          Clear History
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 24, alignItems: "start" }}>
        {/* Chat box */}
        <div className="card" style={{ display: "flex", flexDirection: "column", height: 580, padding: 0, overflow: "hidden" }}>
          <div style={{ flex: 1, padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
            {messages.map((m, idx) => {
              const isUser = m.sender === "user";
              return (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    gap: 12,
                    alignSelf: isUser ? "flex-end" : "flex-start",
                    maxWidth: "85%",
                    flexDirection: isUser ? "row-reverse" : "row",
                  }}
                >
                  <div
                    style={{
                      width: 32, height: 32, borderRadius: "50%",
                      background: isUser ? "rgba(99,102,241,0.2)" : "rgba(52,211,153,0.2)",
                      border: isUser ? "1px solid rgba(99,102,241,0.4)" : "1px solid rgba(52,211,153,0.4)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: isUser ? "#818cf8" : "#34d399", flexShrink: 0
                    }}
                  >
                    {isUser ? <User size={16} /> : <Bot size={16} />}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div
                      style={{
                        padding: "12px 16px",
                        borderRadius: isUser ? "16px 16px 2px 16px" : "16px 16px 16px 2px",
                        background: isUser ? "var(--primary)" : "rgba(255,255,255,0.04)",
                        border: isUser ? "none" : "1px solid var(--border)",
                        color: "var(--text)",
                        fontSize: 14,
                        lineHeight: 1.5,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {m.text}
                    </div>

                    {/* Tool action chips — rendered when agent called a tool */}
                    {m.toolCalls && m.toolCalls.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {m.toolCalls.map((tc, ti) => {
                          // Find matching result for this tool call
                          const matched = m.toolResults?.find((r) => r.toolName === tc.toolName);
                          const resultSummary = matched?.result
                            ? typeof matched.result === "object"
                              ? (matched.result as any).message ||
                                ((matched.result as any).success === false ? "⚠ Action required" : "✓ Done")
                              : String(matched.result)
                            : null;
                          return (
                            <div
                              key={ti}
                              style={{
                                fontSize: 11, fontFamily: "monospace", padding: "5px 10px",
                                background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)",
                                borderRadius: 6, color: "#818cf8", display: "flex", alignItems: "center", gap: 6
                              }}
                            >
                              <Cpu size={12} />
                              <span style={{ fontWeight: 700 }}>{tc.toolName}</span>
                              {resultSummary && (
                                <span style={{ color: "var(--text-muted)", marginLeft: 4 }}>— {resultSummary}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {loading && (
              <div style={{ display: "flex", gap: 12, alignSelf: "flex-start" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(52,211,153,0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "#34d399" }}>
                  <Bot size={16} />
                </div>
                <div style={{ padding: "12px 16px", borderRadius: "16px 16px 16px 2px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 14 }}>
                  Parsing prompt &amp; evaluating safety parameters...
                </div>
              </div>
            )}
          </div>

          <div style={{ padding: 16, borderTop: "1px solid var(--border)", background: "rgba(0,0,0,0.2)", display: "flex", gap: 12 }}>
            <input
              type="text"
              className="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="e.g. Pay 0x89f9... 50 USDC every Friday or Rotate yield to Compound"
              style={{ flex: 1 }}
            />
            <button onClick={sendMessage} disabled={loading} className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Send size={16} /> Send
            </button>
          </div>
        </div>

        {/* Sidebar Info */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              <Sparkles size={14} color="#818cf8" /> Active Context
            </div>

            <div style={{ padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Aave V3 Health Factor</div>
              <div style={{ fontSize: isPortfolioError || hasNoLoan ? 14 : 20, fontWeight: 800, color: hfColor, marginTop: 2 }}>
                {hfDisplay}
              </div>
              <span className={`pill ${isPortfolioError ? "pill-warning" : hasNoLoan ? "pill-muted" : isSafe ? "pill-success" : "pill-danger"}`} style={{ marginTop: 6, fontSize: 10 }}>
                {hfLabel}
              </span>
            </div>

            <div style={{ padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Active Workflows</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", marginTop: 2 }}>
                {activeWorkflowsCount} Running
              </div>
            </div>

            <div style={{ padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Last Action</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#818cf8", marginTop: 2 }}>
                {lastWorkflow ? `${lastWorkflow.type.toUpperCase()} (${lastWorkflow.amount} USDC)` : "None yet"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
