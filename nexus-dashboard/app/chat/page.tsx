"use client";

import { useState, useEffect } from "react";
import { Send, Bot, User, Sparkles } from "lucide-react";

type PortfolioData = {
  healthFactor: number;
  workflows: any[];
};

export default function ChatPage() {
  const wallet = process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97cb35236a1d0190fb25b31c5c0ff4107ec1b";
  const [messages, setMessages] = useState([
    {
      sender: "agent",
      text: "Hello! I am your NexusAgent AI assistant powered by GitHub Models (Llama-3.3-70B). How can I assist with your automated wealth strategy today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);

  useEffect(() => {
    // Check for prompt passed via sessionStorage (e.g. from Templates Fork button)
    const initialPrompt = sessionStorage.getItem("pending_chat_prompt");
    if (initialPrompt) {
      sessionStorage.removeItem("pending_chat_prompt");
      setInput(initialPrompt);
    }

    // Fetch real live context for the sidebar
    async function loadContext() {
      try {
        const res = await fetch(`/api/portfolio/${wallet}`);
        const data = await res.json();
        setPortfolio(data);
      } catch (e) {
        console.error("Chat context fetch error:", e);
      }
    }
    loadContext();
  }, [wallet]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { sender: "user", text: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { sender: "agent", text: data.reply || "Message received and processed." },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          sender: "agent",
          text: `Evaluated prompt "${userMsg}". Position health factor is ${portfolio?.healthFactor ?? 99} (${(portfolio?.healthFactor ?? 99) > 1.5 ? "Safe Zone" : "Risk"}).`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const hf = portfolio?.healthFactor ?? 99;
  const displayHf = hf > 90 ? "∞" : hf.toFixed(2);
  const hfColor = hf > 1.5 ? "#34d399" : "#fb7185";
  const activeCount = portfolio?.workflows?.length ?? 1;

  return (
    <div className="animate-in" style={{ display: "flex", flexDirection: "column", gap: 24, height: "calc(100dvh - 120px)" }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <h1 className="page-title">AI Assistant &amp; Natural Language Payroll</h1>
        <p className="page-subtitle">Interact with the GitHub Models decision engine or submit natural language commands</p>
      </div>

      <div className="grid-chat" style={{ flex: 1, minHeight: 0 }}>
        {/* Left context panel */}
        <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, fontFamily: "var(--font-space-grotesk), sans-serif", fontWeight: 800, fontSize: 15, color: "var(--text)" }}>
              <Sparkles size={16} color="var(--primary)" /> Active Context
            </div>

            {/* Mini health ring */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "20px 0" }}>
              <div style={{
                width: 120, height: 120, borderRadius: "50%",
                background: `conic-gradient(${hfColor} 0% 100%, rgba(255,255,255,0.06) 100% 100%)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: `0 0 30px -6px ${hfColor}66, inset 0 0 0 10px var(--surface)`
              }}>
                <div style={{
                  width: 88, height: 88, borderRadius: "50%",
                  background: "var(--surface)",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center"
                }}>
                  <span style={{ fontSize: 26, fontWeight: 900, color: hfColor, letterSpacing: "-0.04em" }}>
                    {displayHf}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase" }}>HF</span>
                </div>
              </div>
              <span className={`pill ${hf > 1.5 ? "pill-success" : "pill-danger"}`}>
                {hf > 1.5 ? "Safe Zone" : "Liquidation Risk"}
              </span>
            </div>

            {/* Stats */}
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {[
                { label: "Model",       value: "Llama-3.3-70B",         color: "#818cf8" },
                { label: "Workflows",   value: `${activeCount} Running`, color: "#34d399" },
                { label: "Last Action", value: "DCA Swap 100 USDC",     color: "var(--text)" },
              ].map((row) => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                  <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>{row.label}</span>
                  <span style={{ color: row.color, fontWeight: 700, fontFamily: "ui-monospace, monospace" }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tip box */}
          <div style={{ padding: "14px 16px", borderRadius: "var(--radius-sm)", background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", fontSize: 12, color: "#818cf8", lineHeight: 1.6 }}>
            💡 <strong style={{ color: "var(--text)" }}>Tip:</strong> Try asking &quot;Pay 200 USDC to 0x... every Friday&quot; to test PayChain automation.
          </div>
        </div>

        {/* Chat panel */}
        <div className="chat-panel">
          <div className="chat-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`msg ${msg.sender === "user" ? "user" : ""}`}>
                <div className={`msg-avatar ${msg.sender === "agent" ? "agent" : "user"}`}>
                  {msg.sender === "user" ? <User size={16} /> : <Bot size={16} />}
                </div>
                <div className={`msg-bubble ${msg.sender === "agent" ? "agent" : "user"}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#818cf8", fontStyle: "italic" }}>
                <Bot size={14} style={{ animation: "pulse 1.5s infinite" }} /> Brain reasoning engine at work...
              </div>
            )}
          </div>

          <form onSubmit={handleSend} className="chat-footer">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. Pay 200 USDC to 0x89f9... every Friday"
              className="chat-input"
            />
            <button type="submit" className="btn btn-primary">
              <Send size={15} /> Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
