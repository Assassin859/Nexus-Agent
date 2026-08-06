# NexusAgent — Demo Video Scripts

> **Last updated:** 2026-08-06 · **Deploy:** `c86b118` (manual Aave controls)  
> **Dashboard:** https://spirited-heart-production-b5c5.up.railway.app  
> **Monitored wallet:** `0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b`  
> **Agentic MPC wallet:** `0xc63a364f8bbaa6be263f577762e7c180a68b9fac`

Use these as **read-aloud narration** while screen-recording. Pause markers `[PAUSE]` = 2–3 seconds. `[CLICK]` = mouse action.

---

## Script A — 30 seconds (judge elevator)

**[CLICK] Resilience page**

"This is NexusAgent — an autonomous DeFi Guardian on KeeperHub. Every risky transaction is pre-flight simulated before broadcast. If simulation fails, we log it here — zero gas wasted."

**[CLICK] Feed → On-chain proofs filter → open a repay row → RPC verified badge**

"When a repay mines, we don't trust the platform's status alone. We independently re-read Aave on-chain via RPC and show a verified badge on the Feed."

**[CLICK] BaseScan link on a repay tx**

"Thirty-five mined proofs on Base Sepolia — Guardian repays, DCA, yield rotates — plus Tempo and mainnet x402. Live on Railway, no localhost demo."

---

## Script B — 3 minutes (no wallet / judge path)

| Time | Screen | Narration |
|------|--------|-----------|
| 0:00 | Portfolio (no sign-in) | "NexusAgent monitors a live Aave V3 position on Base Sepolia. Judges can open the dashboard without MetaMask — public preview shows real health factor, debt, and collateral for our demo wallet." |
| 0:20 | Scroll Portfolio — workflows summary | "Below that: active PayChain, DCA, Guardian, and Yield workflows registered through KeeperHub MCP." |
| 0:35 | Feed — **On-chain proofs** toggle ON | "The Feed defaults to on-chain proofs only — thirty-five mined transactions. Each row links to BaseScan or Tempo Explorer." |
| 0:50 | Click a Guardian **repay** row | "Guardian repays show the full pipeline: triggered, simulated, broadcast, mined. After execution we RPC-verify Aave state — that's the RPC verified badge." |
| 1:05 | Click **Yield Rotate** tile filter | "Three mined Aave-to-Compound yield rotations — proof scripts on the agentic MPC wallet, logged to the monitored wallet for Feed visibility." |
| 1:20 | Resilience — Decision Matrix | "Resilience is our audit story. The matrix buckets holds, partial repays, full repays, and simulation blocks." |
| 1:35 | Resilience — simulation intercept card | "This row is a reverted simulation — the harness caught a bad repay before broadcast. No gas spent." |
| 1:50 | Resilience — success repay arc | "Then successful repays as health factor recovered — four BaseScan links in the README." |
| 2:05 | Chat (read-only, no sign-in) | Type: *What is my health factor?* | "Natural language maps to native tools — here, a live Aave read, no manual calldata." |
| 2:20 | /tempo page | "Beyond Base Sepolia: four Tempo Moderato attestation transactions with public explorer links." |
| 2:35 | Workflows — Integrations card | "We published a KeeperHub marketplace listing and proved paid x402 consumption on Base mainnet — one BaseScan link here." |
| 2:50 | README or repo tab | "One-twenty-six harness tests, production smoke on Railway, full spec in the repo. NexusAgent — autonomous brain, KeeperHub execution rails." |

---

## Script C — 5 minutes (full demo + signed-in Aave controls)

### Segment 1 — Public judge path (0:00 – 2:00)

Same as Script B, 0:00–2:00. Compress Feed/Resilience if needed.

**Extra line at 1:50 (Portfolio, still no sign-in):**

"Signed-in users get Aave Position Controls — supply, borrow, repay, withdraw — with preview simulation before every submit. I'll show that in segment two."

---

### Segment 2 — Sign in + KeeperHub Sync (2:00 – 2:30)

**[CLICK] Connect MetaMask — demo monitored wallet**

"For live writes I sign in with Ethereum on Base Sepolia, using the monitored demo wallet so Feed proofs stay aligned."

**[CLICK] KeeperHub Sync — paste `kh_…` key**

"KeeperHub OAuth is not the MCP API key — I paste the org API key in KeeperHub Sync. That unlocks chat writes, manual Aave actions, and PayChain scheduling."

`[PAUSE]`

---

### Segment 3 — Manual Aave controls (UI) (2:30 – 3:30)

**[CLICK] Portfolio → Aave Position Controls panel**

"This is new: manual Aave V3 position controls. USDC debits from the agentic MPC wallet — not MetaMask. Supply and repay use onBehalfOf the monitored wallet."

**[CLICK] Dual-wallet info banner (if visible)**

"In dual-wallet mode, borrow may need Aave credit delegation; withdraw pulls from agentic Aave supply only. The UI warns you; preview runs on-chain simulation before you confirm."

**[CLICK] Supply tab → amount 25 → Preview**

"Preview shows health factor before and estimated HF after, agentic USDC balance, and any warnings. Simulation runs now — if it would revert, we block here."

**[CLICK] Confirm & Execute (only if preview is green)**

"If simulation passes, Confirm submits a KeeperHub MCP workflow — approve if needed, then supply. The Feed logs it like Guardian actions."

**Alternative if you don't want a live tx:** Stop at Preview and say: "In production we'd confirm here — same path as Guardian: simulate, then MCP execute, then RPC verify."

---

### Segment 4 — Chat Aave + triggers (3:30 – 4:20)

**[CLICK] Chat**

Type: *Supply 50 USDC to Aave*

"The chat tool mirrors the panel — preview first, then I reply confirm."

Type: *confirm*

"Confirm is detected from natural language — same pattern as PayChain overrides — so judges don't depend on the model passing a boolean flag."

Type: *What are my workflows?*

"listWorkflows returns PayChain, DCA, Guardian, Yield, plus platform modules."

**Optional API segment (cutaway or terminal):**

```powershell
curl -X POST https://nexus-agent-production-7783.up.railway.app/api/trigger/guardian `
  -H "Authorization: Bearer YOUR_JWT"
```

"Live guardian trigger — when HF is healthy, expect hold, not a wasted repay. That's by design."

---

### Segment 5 — Close (4:20 – 5:00)

**[CLICK] Feed — refresh, newest row**

"Every action lands in Postgres executions_log — chain-aware explorer links, independent verification in aiAnalysis."

**[CLICK] Resilience one more time**

"Simulation intercept plus mined success — that's the NexusAgent story: Reasoning Harness, zero wasted gas, don't trust the platform's word."

**Closing line:**

"Live dashboard on Railway, thirty-five mined proofs, manual Aave controls with preview simulation, KeeperHub MCP execution, and one-twenty-six tests. Thank you."

---

## Script D — Live-trigger segment only (~90 seconds)

For B-roll or appendix footage.

| Step | Action | Say |
|------|--------|-----|
| 1 | SIWE as demo wallet | "Monitored wallet sign-in keeps Feed scoped to demo proofs." |
| 2 | `POST /api/trigger/guardian` → 200, likely hold | "Guardian runs every five minutes; manual trigger shows hold when HF is safe." |
| 3 | Feed → DCA swap row | "DCA live trigger may revert on Sepolia Uniswap — we show the mined DCA proof instead." |
| 4 | Feed → 3× rotate rows | "Yield cron skips on-chain in dual-wallet mode — these three rotates came from yield:proof." |
| 5 | Workflows → dual-wallet banner | "PayChain payroll debits the agentic wallet — banner explains the split." |

---

## Chat prompts cheat sheet (copy-paste)

**Read-only (no sign-in):**
- What is my health factor?
- Show my recent transactions
- What are my Tempo proofs?
- List my workflows

**Signed-in (needs `kh_…` key):**
- Supply 50 USDC to Aave → then: confirm
- Repay 25 USDC on Aave → then: confirm
- Set up weekly DCA 50 USDC into ETH
- Register guardian monitor
- Trigger guardian now

**Avoid on live demo unless rehearsed:**
- Borrow 100 USDC (dual-wallet needs credit delegation)
- Withdraw (needs agentic Aave supply balance)

---

## Pre-recording checklist

```powershell
pnpm --prefix nexus-agent run verify          # expect 126 passed
pnpm --prefix nexus-agent run build
pnpm --prefix nexus-dashboard exec tsc --noEmit
$env:AGENT_URL="https://nexus-agent-production-7783.up.railway.app"
$env:DASHBOARD_URL="https://spirited-heart-production-b5c5.up.railway.app"
pnpm --prefix nexus-agent run smoke:tier2
pnpm --prefix nexus-agent run smoke:live-triggers
```

1. Incognito → Portfolio HF loads without sign-in  
2. Feed → On-chain proofs → repay + rotate + swap rows  
3. Resilience → Yield Rotate tile > 0  
4. Deploy finished on Railway after latest push  
5. KeeperHub API key ready for signed-in segment  
6. MetaMask on Base Sepolia with demo monitored wallet  

---

## DoraHacks form — updated summary blurb

**Summary (paste):**

NexusAgent is an autonomous DeFi Guardian on KeeperHub MCP: multi-candidate Reasoning Harness, pre-flight simulation, independent Aave RPC verification after every repay and manual position action, 35 mined Base Sepolia proofs, manual supply/borrow/repay/withdraw via Portfolio UI and chat, plus Tempo Moderato and mainnet x402 marketplace proofs. Live on Railway — no localhost.
