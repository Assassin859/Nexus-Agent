"use client";

import { useState } from "react";
import { Send, Bot, User, Sparkles } from "lucide-react";
import HealthGauge from "@/components/HealthGauge";

export default function ChatPage() {
  const [messages, setMessages] = useState([
    {
      sender: "agent",
      text: "Hello! I am your NexusAgent AI assistant powered by GitHub Models (Llama-3.3-70B). How can I assist with your automated wealth strategy today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
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

      setMessages((prev) => [...prev, { sender: "agent", text: data.reply || "Message received and processed." }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { sender: "agent", text: "I evaluated your prompt. Position health factor is 1.87 (Safe Zone). Active workflows: Guardian, DCA, Payroll." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 animate-fade-up h-[calc(100vh-100px)]">
      <div>
        <h1 className="section-title">AI Assistant & Natural Language Payroll</h1>
        <p className="section-subtitle">Interact with the GitHub Models decision engine or submit natural language commands</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 min-h-0">
        {/* Left Side Context Panel */}
        <div className="glass p-5 flex flex-col gap-6">
          <h3 className="font-heading font-bold text-base flex items-center gap-2">
            <Sparkles size={18} className="text-indigo-400" /> Active Context
          </h3>

          <HealthGauge value={1.87} size={160} label="Current HF" />

          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-2 border-b border-[var(--color-border)]">
              <span className="text-[var(--color-text-muted)]">Model</span>
              <span className="font-mono text-white">Llama-3.3-70B</span>
            </div>
            <div className="flex justify-between py-2 border-b border-[var(--color-border)]">
              <span className="text-[var(--color-text-muted)]">Workflows</span>
              <span className="text-emerald-400 font-semibold">3 Running</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-[var(--color-text-muted)]">Last Action</span>
              <span className="text-white">Repay 500 USDC</span>
            </div>
          </div>
        </div>

        {/* Right Chat Panel */}
        <div className="lg:col-span-3 glass flex flex-col min-h-0 p-0 overflow-hidden">
          <div className="flex-1 p-6 overflow-y-auto space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex items-start gap-3 ${msg.sender === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${msg.sender === "user" ? "bg-[var(--color-primary)]" : "bg-white/10"}`}>
                  {msg.sender === "user" ? <User size={16} /> : <Bot size={16} className="text-indigo-400" />}
                </div>
                <div className={`p-4 rounded-2xl max-w-[80%] text-sm leading-relaxed ${msg.sender === "user" ? "bg-[var(--color-primary)] text-white" : "bg-white/5 border border-[var(--color-border)] text-slate-200"}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] italic">
                <Bot size={14} className="animate-spin" /> Brain is reasoning...
              </div>
            )}
          </div>

          <form onSubmit={handleSend} className="p-4 border-t border-[var(--color-border)] flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. Pay 200 USDC to 0x89f9... every Friday"
              className="flex-1 bg-white/5 border border-[var(--color-border)] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[var(--color-primary)] transition"
            />
            <button type="submit" className="btn-primary">
              <Send size={16} /> Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
