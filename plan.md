# NexusAgent — Master Submission Execution Roadmap (August 2026)

> **Submission Strategy:** Divided into 4 sequential execution batches. Complete each batch gate before proceeding to the next to ensure zero wasted effort.

---

## 🟢 Batch 1 — Production Gate (~30 min)
*Objective: Verify Railway production backend parity and MCP warm-up.*

- [ ] **Secret Sanity Check**: Confirm `JWT_SECRET` in root `.env` matches Railway (`nexus-agent-hackathon-super-secret-jwt-key-2026`). *(Do NOT commit secret strings to GitHub).*
- [ ] **Railway Execution Test**:
  ```powershell
  $env:AGENT_URL="https://nexus-agent-production-7783.up.railway.app"
  pnpm --prefix nexus-agent run phase2
  ```
- [ ] **Audit DB Logs**:
  ```bash
  pnpm --prefix nexus-agent run logs
  ```
  *Verify newly created execution rows appear with live timestamps.*
- [ ] **MCP Session Warm-up**:
  ```bash
  pnpm --prefix nexus-agent run surfaces
  ```
- **Gate 1 Exit Criteria:** `phase2` script returns `exit 0` against Railway and new execution rows appear in `check-logs.ts`.

---

## 🟢 Batch 2 — Browser End-to-End (~20 min)
*Objective: Confirm the exact frontend experience judges will encounter on production.*

- [ ] **Dashboard Production Environment**: Set `nexus-dashboard/.env.local`:
  ```bash
  NEXT_PUBLIC_AGENT_URL=https://nexus-agent-production-7783.up.railway.app
  NEXT_PUBLIC_WALLET_ADDRESS=0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b
  ```
- [ ] **Browser Flow Verification (http://localhost:3000)**:
  1. SIWE Sign In with MetaMask (`0x89f97...`) on Base Sepolia.
  2. Portfolio tab -> displays live Health Factor (~1.32 post-repay; ~3.26 historical hold demo).
  3. KeeperHub Sync Modal -> paste `kh_...` -> Sidebar shows **Green Badge: KeeperHub MCP Connected**.
  4. AI Chat -> ask *"What is my health factor?"* -> returns live HF from chain.
  5. Feed & Resilience tabs -> render Decision Matrix & simulation cards cleanly.
- **Gate 2 Exit Criteria:** Browser flow works 100% cleanly on Railway backend without `401 Unauthorized` or network errors.

---

## 🟢 Batch 3 — Narrative Rehearsal & Housekeeping (~45 min)
*Objective: Lock in Path A pitch narrative and clean demo feed.*

- [ ] **Narrative Selection**: **Path A — Simulation-First & Resilience** (Highlighting real-time Aave V3.2 reading, Guardian quantitative rules, Reasoning Harness, and 0 gas pre-flight simulation intercepts).
- [ ] **Feed Housekeeping (Optional)**:
  ```bash
  pnpm --prefix nexus-agent exec tsx src/scripts/clear-db.ts
  pnpm --prefix nexus-agent run phase2
  ```
- [ ] **Runbook Rehearsal**: Rehearse 4-scene script from `submission_runbook.md` once with a timer without recording.
- **Gate 3 Exit Criteria:** Able to narrate all 4 scenes smoothly within 3 minutes without improvising.

---

## 🟢 Batch 4 — Recording & Hackathon Submission (~1 hour)
*Objective: Produce video asset and submit DoraHacks form.*

- [ ] **Video Recording**: Record 3-minute screen capture following `submission_runbook.md` (take 1 + backup take).
- [ ] **DoraHacks Form Submission**: Fill form fields (project title, tagline, repo URL, Railway URL, known limitations) from `submission_runbook.md`.
- [ ] **Git Push**: Re-verify zero `.env` files are tracked, build TypeScript packages, and push final code:
  ```bash
  pnpm --prefix nexus-agent run build
  pnpm --prefix nexus-dashboard run build
  git add .
  git commit -m "docs: finalize master submission plan and verification runbook"
  git push origin main
  ```
- **Gate 4 Exit Criteria:** DoraHacks form submitted & video uploaded before Aug 13 deadline.

---

## 📋 Deferred Post-Submission Work (P2 — After Submission)

| Task | Effort | Priority |
|:---|:---:|:---:|
| **Forced Simulation Error Script** | Low | P2 |
| **Tier C Integration Harness Assertions** | Medium | P2 |
| **Pino Logger Migration in PayChain/Compound** | Low | P2 |
| **Compound Sepolia APY Decoding Fix** | Low | P2 |

---

## Verification Quick Reference

```bash
pnpm --prefix nexus-agent run verify          → 21 passed, 2 skipped, 0 failed
pnpm --prefix nexus-agent run e2e             → full system (markets, chat, templates, feed)
pnpm --prefix nexus-agent run verify:integration → 19 passed, 2 skipped, 0 failed
pnpm --prefix nexus-agent run phase2          → 4/4 modules verified
pnpm --prefix nexus-agent run surfaces        → 17/17 MCP surfaces verified
```
