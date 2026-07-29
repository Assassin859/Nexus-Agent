"use client";

import { useEffect, useState } from "react";
import { Users, Plus, Trash2, Shield, Vault, User, ExternalLink, Cpu } from "lucide-react";
import { useWallet } from "@/context/WalletContext";

type PayeeMember = {
  name: string;
  address: string;
};

type PayeeItem = {
  id: string;
  name: string;
  type: "single" | "team";
  payoutMode: "direct" | "vault_pool";
  vaultPoolAddress?: string;
  recipientAddresses: PayeeMember[];
  memberCount: number;
  parentTeamId?: string;
};

export default function PayeesPage() {
  const { walletAddress: wallet } = useWallet();
  const [payeesList, setPayeesList] = useState<PayeeItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [name, setName] = useState("");
  const [type, setType] = useState<"single" | "team">("team");
  const [payoutMode, setPayoutMode] = useState<"direct" | "vault_pool">("direct");
  const [vaultPoolAddress, setVaultPoolAddress] = useState("");
  const [members, setMembers] = useState<PayeeMember[]>([
    { name: "", address: "" },
    { name: "", address: "" },
  ]);
  const [saving, setSaving] = useState(false);

  async function loadPayees() {
    try {
      const agentUrl = process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:3001";
      const res = await fetch(`${agentUrl}/api/payees/${wallet}?t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setPayeesList(data);
      }
    } catch (err) {
      console.error("Failed to load payees:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPayees();
    const interval = setInterval(loadPayees, 3000);
    return () => clearInterval(interval);
  }, [wallet]);

  function handleAddMember() {
    setMembers([...members, { name: "", address: "" }]);
  }

  function handleRemoveMember(idx: number) {
    setMembers(members.filter((_, i) => i !== idx));
  }

  function handleMemberChange(idx: number, field: "name" | "address", val: string) {
    const updated = [...members];
    updated[idx][field] = val;
    setMembers(updated);
  }

  async function handleCreatePayee() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const agentUrl = process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:3001";
      const validMembers = members.filter(m => m.name.trim() || m.address.trim());

      const res = await fetch(`${agentUrl}/api/payees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userWallet: wallet,
          name: name.trim(),
          type,
          payoutMode: type === "single" ? "direct" : payoutMode,
          vaultPoolAddress: (type === "team" && payoutMode === "vault_pool") ? vaultPoolAddress.trim() : null,
          members: type === "single" ? [{ name: name.trim(), address: members[0]?.address?.trim() || "" }] : validMembers,
        }),
      });

      if (res.ok) {
        setName("");
        setVaultPoolAddress("");
        setMembers([
          { name: "", address: "" },
          { name: "", address: "" },
        ]);
        await loadPayees();
      }
    } catch (err) {
      console.error("Failed to create payee:", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePayee(id: string) {
    try {
      const agentUrl = process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:3001";
      await fetch(`${agentUrl}/api/payees/${id}`, { method: "DELETE" });
      await loadPayees();
    } catch (err) {
      console.error("Failed to delete payee:", err);
    }
  }

  async function handleClearAllPayees() {
    if (!confirm("Are you sure you want to delete all payees for this wallet?")) return;
    try {
      const agentUrl = process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:3001";
      await fetch(`${agentUrl}/api/payees/all/${wallet}`, { method: "DELETE" });
      await loadPayees();
    } catch (err) {
      console.error("Failed to clear payees:", err);
    }
  }

  return (
    <div className="animate-in" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 className="page-title">Payees &amp; Team Directory</h1>
          <p className="page-subtitle">Manage single recipients, named team members, and shared team vault pools</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {payeesList.length > 0 && (
            <button
              onClick={handleClearAllPayees}
              className="btn btn-outline"
              style={{ padding: "6px 12px", fontSize: 12, color: "#f87171", borderColor: "rgba(248,113,113,0.3)" }}
            >
              Clear All Payees
            </button>
          )}
          <div style={{ padding: "8px 14px", borderRadius: 8, background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.25)", fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--text-muted)" }}>Directory for:</span>
            <span style={{ fontFamily: "monospace", color: "#818cf8", fontWeight: 700 }}>
              {wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : "Disconnected"}
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, alignItems: "start" }}>
        {/* Directory List */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {loading ? (
            <div className="card" style={{ color: "var(--text-muted)", textAlign: "center", padding: 30 }}>
              Loading payees directory...
            </div>
          ) : payeesList.length === 0 ? (
            <div className="card" style={{ color: "var(--text-muted)", textAlign: "center", padding: 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <Users size={36} color="#818cf8" />
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>No Registered Payees</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>Add a single payee or team on the right to resolve prompts like <strong style={{ color: "#818cf8" }}>"pay dev team 20 USDC"</strong>.</div>
              </div>
            </div>
          ) : (
            payeesList.map((item) => (
              <div key={item.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 12, padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: item.type === "team" ? "rgba(99,102,241,0.15)" : "rgba(52,211,153,0.15)",
                      border: `1px solid ${item.type === "team" ? "rgba(99,102,241,0.3)" : "rgba(52,211,153,0.3)"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: item.type === "team" ? "#818cf8" : "#34d399"
                    }}>
                      {item.type === "team" ? <Users size={18} /> : <User size={18} />}
                    </div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
                        {item.name}
                        {item.parentTeamId && (
                          <span style={{ fontSize: 10, background: "rgba(255,255,255,0.06)", padding: "2px 8px", borderRadius: 4, color: "var(--text-muted)" }}>
                            Team Member
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ textTransform: "capitalize" }}>{item.type} • {item.memberCount} member{item.memberCount > 1 ? "s" : ""}</span>
                        {item.type === "team" && (
                          <span className={`pill ${item.payoutMode === "vault_pool" ? "pill-warning" : "pill-success"}`} style={{ fontSize: 9 }}>
                            {item.payoutMode === "vault_pool" ? "Vault Pool" : "Direct Payouts"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button onClick={() => handleDeletePayee(item.id)} className="btn" style={{ padding: 6, color: "#f87171", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Vault Pool address banner */}
                {item.payoutMode === "vault_pool" && item.vaultPoolAddress && (
                  <div style={{ padding: 10, borderRadius: 6, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", fontSize: 12, color: "#fbbf24", display: "flex", alignItems: "center", gap: 8 }}>
                    <Vault size={14} />
                    <span>Shared Vault Pool Address: <strong style={{ fontFamily: "monospace" }}>{item.vaultPoolAddress}</strong></span>
                  </div>
                )}

                {/* Member wallet pills */}
                {Array.isArray(item.recipientAddresses) && item.recipientAddresses.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                    {item.recipientAddresses.map((m, idx) => (
                      <div key={idx} style={{ padding: "6px 12px", borderRadius: 6, background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", fontSize: 11, fontFamily: "monospace", display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ color: "#818cf8", fontWeight: 700 }}>{m.name}:</span>
                        <span style={{ color: "var(--text-muted)" }}>{m.address.slice(0, 6)}...{m.address.slice(-4)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Add Payee / Team Form */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
            <Plus size={16} color="#818cf8" /> Add Payee or Team
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Payee or Team Name</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. dev team, Alice, Designers"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => setType("team")}
              className="btn"
              style={{ flex: 1, fontSize: 12, background: type === "team" ? "rgba(99,102,241,0.2)" : "transparent", border: `1px solid ${type === "team" ? "#818cf8" : "var(--border)"}`, color: type === "team" ? "#818cf8" : "var(--text-muted)" }}
            >
              <Users size={14} /> Team
            </button>
            <button
              onClick={() => setType("single")}
              className="btn"
              style={{ flex: 1, fontSize: 12, background: type === "single" ? "rgba(52,211,153,0.2)" : "transparent", border: `1px solid ${type === "single" ? "#34d399" : "var(--border)"}`, color: type === "single" ? "#34d399" : "var(--text-muted)" }}
            >
              <User size={14} /> Single
            </button>
          </div>

          {type === "team" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)" }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>Payout Mode</label>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setPayoutMode("direct")}
                  className="btn"
                  style={{ flex: 1, fontSize: 11, background: payoutMode === "direct" ? "rgba(52,211,153,0.15)" : "transparent", border: `1px solid ${payoutMode === "direct" ? "#34d399" : "var(--border)"}`, color: payoutMode === "direct" ? "#34d399" : "var(--text-muted)" }}
                >
                  Direct Payouts
                </button>
                <button
                  onClick={() => setPayoutMode("vault_pool")}
                  className="btn"
                  style={{ flex: 1, fontSize: 11, background: payoutMode === "vault_pool" ? "rgba(245,158,11,0.15)" : "transparent", border: `1px solid ${payoutMode === "vault_pool" ? "#f59e0b" : "var(--border)"}`, color: payoutMode === "vault_pool" ? "#f59e0b" : "var(--text-muted)" }}
                >
                  Shared Vault Pool
                </button>
              </div>

              {payoutMode === "vault_pool" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                  <label style={{ fontSize: 11, color: "var(--text-muted)" }}>Vault Pool Address (MPC/Multisig)</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="0xVaultAddress..."
                    value={vaultPoolAddress}
                    onChange={(e) => setVaultPoolAddress(e.target.value)}
                    style={{ fontSize: 12, fontFamily: "monospace" }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Member Inputs */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
              {type === "team" ? "Team Member Wallets" : "Recipient Wallet Address"}
            </label>
            {members.map((m, idx) => (
              <div key={idx} style={{ display: "flex", flexDirection: "column", gap: 4, padding: 8, borderRadius: 6, background: "rgba(0,0,0,0.2)", border: "1px solid var(--border)" }}>
                {type === "team" && (
                  <input
                    type="text"
                    className="input"
                    placeholder={`Member Name (e.g. Alice)`}
                    value={m.name}
                    onChange={(e) => handleMemberChange(idx, "name", e.target.value)}
                    style={{ fontSize: 12 }}
                  />
                )}
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="text"
                    className="input"
                    placeholder="0x1234...4321"
                    value={m.address}
                    onChange={(e) => handleMemberChange(idx, "address", e.target.value)}
                    style={{ fontSize: 12, fontFamily: "monospace", flex: 1 }}
                  />
                  {members.length > 1 && (
                    <button onClick={() => handleRemoveMember(idx)} className="btn" style={{ padding: "0 8px", color: "#f87171" }}>
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}
            {type === "team" && (
              <button onClick={handleAddMember} className="btn" style={{ fontSize: 11, background: "rgba(255,255,255,0.03)", border: "1px dashed var(--border)", marginTop: 4 }}>
                + Add Member
              </button>
            )}
          </div>

          <button onClick={handleCreatePayee} disabled={saving} className="btn btn-primary" style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Plus size={14} /> {saving ? "Saving..." : "Save Payee Entity"}
          </button>
        </div>
      </div>
    </div>
  );
}
