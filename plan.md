# Pre-Aug 4 Roadmap & Execution Plan

> **Focus:** ~2–4 hours of targeted bug fixes & correctness alignment + half a day of demo rehearsal.

---

## P0 — Fix Before Aug 4 (Demo-Breaking)

- [ ] **1. Guardian: `aiAnalysis` lost on successful execution**
  - On mined success (`finalStatus === "success"`), `guardian.ts` overwrites `aiAnalysis` with only `{ ...decision.analysis, executionId }`, losing `candidateActions`, `harnessOverride`, `priceTrend`, etc.
  - **Fix:** Update line ~321 to set `aiAnalysis: { ...aiAnalysisPayload, executionId }` (matches stub path pattern).
  - **File:** `nexus-agent/src/modules/guardian.ts`

- [ ] **2. Feed Page: `aiAnalysis` missing from `TransactionCard`**
  - `feed/page.tsx` defines `FeedItem` without `aiAnalysis` and doesn't pass it down.
  - `TransactionCard` already has an "AI Reasoning" expand panel, but data isn't wired.
  - **Fix:** Add `aiAnalysis?: any` to `FeedItem` type in `feed/page.tsx` and forward it to `TransactionCard`.
  - **Files:** `nexus-dashboard/app/feed/page.tsx`, `nexus-dashboard/components/TransactionCard.tsx`

- [ ] **3. Demo Row Strategy**
  - Until #1 & #2 are fixed, demo `hold`, `reverted_simulation`, or `simulated_stub` Guardian rows to show the candidate harness JSON.

- [ ] **4. KeeperHub Ops (Demo Environment Warmup)**
  - Cold MCP calls fallback to `wf-stub-*`. SIWE login doesn't auto-sync API keys to local storage.
  - **Action:** Warm up MCP with a test workflow, confirm Sepolia network, and pre-save `kh_...` API key in `KeeperHubSyncModal`.

- [ ] **5. Dual-Wallet Config Awareness**
  - If `NEXT_PUBLIC_WALLET_ADDRESS ≠ AGENTIC_WALLET_ADDRESS`: Yield Rotator skips (Aave withdraw lacks `onBehalfOf`). Guardian uses signer USDC balance for monitored wallet.
  - **Action:** Align wallets for demo OR add demo slide note explaining dual-wallet vs same-wallet mechanics.

---

## P1 — Important (Correctness & Q&A Readiness)

- [ ] **6. Injected `executionHistory` Prompt Rule Alignment**
  - `schemas.ts` Rule #1 references `executionHistory` for CYCLE LOCK (`block_transaction`).
  - `guardian.ts` prompt JSON omits `executionHistory` (though Step 4.3 software lock prevents double execution).
  - **Fix:** Pass `executionHistory: activePendingTx ? ["pending_transaction_exists"] : []` in prompt JSON OR update system prompt and docs.
  - **Files:** `nexus-agent/src/modules/guardian.ts`, `nexus-agent/src/brain/schemas.ts`

- [ ] **7. Yield Rotator Single-Flight / Pending Lock**
  - Guardian & DCA use a 15m TTL + active pending lock guard. Yield rotator executes directly, risking double-rotation under overlapping triggers.
  - **Fix:** Insert a `pending` log row prior to workflow creation and resolve status post-settlement.
  - **File:** `nexus-agent/src/modules/yield-rotator.ts`

- [ ] **8. Wallet Normalization Gaps (PayChain & DCA)**
  - PayChain contains un-lowercased `userWallet: walletAddress` assignments. DCA logger/key resolution uses raw `userWallet`.
  - **Fix:** Enforce `const monitoredWallet = walletAddress.toLowerCase()` at module entry points.
  - **Files:** `nexus-agent/src/modules/paychain.ts`, `nexus-agent/src/modules/dca.ts`

- [ ] **9. Feed Badge for `delayed` Status**
  - DCA gas/balance delays log `status: "delayed"`, but `FeedItem` types omit it, falling back to a generic badge.
  - **Fix:** Add `"delayed"` to `FeedItem` status union and style badge in `TransactionCard`.
  - **Files:** `nexus-dashboard/app/feed/page.tsx`, `nexus-dashboard/components/TransactionCard.tsx`

- [ ] **10. Documentation Reconciliation**
  - `walkthrough.md`: Update test counts and audit references.
  - `TECHNICAL_SPEC.md §7`: Align DB schema field names (`cycleStart` vs `cycleStartDate`).
  - `README.md`: Verify setup instructions match current code.

- [ ] **11. Tier C Verification Labeling**
  - `verify-full-system.ts --integration` checks DB connection; pending TTL & cancel workflow tests remain skipped.
  - **Fix:** Implement at least one integration test or clarify skip messages in harness summary.
  - **File:** `nexus-agent/src/scripts/verify-full-system.ts`

---

## P2 — Polish (Optional / Time Permitting)

- [ ] **12. Feed Summary Line for Harness Decisions**
  - Render a human-readable badge on feed cards (e.g., `Harness: Repay | LLM: Hold | Override: Yes`).
- [ ] **13. Logging Hygiene Clean-up**
  - Replace remaining `console.warn` in `paychain.ts`, `simulate.ts`, and `allowance.ts` with structured pino `childLogger`.
- [ ] **14. `getPriceTrend()` Demo Strategy**
  - Chainlink Sepolia updates can be sparse. Demonstrate with logs showing `priceTrend: "stable"` and explain thresholds.
- [ ] **15. Seed Data Cleanup**
  - Wipe/reseed test DB before demo to avoid dummy/stub hash records appearing in feed.

---

## ✅ Completed & Verified Stack

- **Phase 11–13 Core:** Canonical Spec (`docs/TECHNICAL_SPEC.md`), Pure Candidate Harness (`selectBestCandidate`), 16 Tier A unit tests, live Chainlink `priceTrend`, yield `monitoredWallet` normalization, `price-feed` pino logging.
- **PayChain & DCA Reliability:** PayChain UUID FKs & compensating cancels; DCA 15m pending lock TTL.
- **Security & Safety:** Capped approvals (`amount * 1.10`), `assertWalletScope` IDOR checks, MCP parsing retries, cron evaluators.
