# KeeperHub Bug Report & UX Friction — NexusAgent

**Team:** NexusAgent (Agents Onchain, DoraHacks)  
**Last verified:** 2026-08-02 against fork `C:\Users\maitr\Downloads\keeperhub`  
**Live demo:** https://spirited-heart-production-b5c5.up.railway.app  
**Upstream PR drafts:** [PRs.md](PRs.md)

> Also reported independently: **Deplex** (CHAIN_MISMATCH) · **ApprovalSentinel** ([keeperhub#1856](https://github.com/KeeperHub/keeperhub/pull/1856)) · **TRAIDE** (Tempo polling + memo gas)

---

## Removed from this doc (fixed or addressed upstream)

| Former ID | Reason removed |
|-----------|----------------|
| ~~FRICTION-01~~ Wallet Scanner buried | **Fixed in fork:** `/` is now `ScanLanding` (`app/page.tsx`). Scanner is homepage. |
| ~~FRICTION-02~~ (full) Generic 401 with no key hint | **Partially fixed:** `lib/api-key-auth.ts` now returns *"Expected key starting with kh_"*. Replaced by **FRICTION-02** (narrower: webhook keys). |
| ~~FRICTION-05~~ Flat `get_execution_logs` array | **Superseded:** Tool removed; merged into `get_execution` with `truncateData` / `nodeIds`. Replaced by **BUG-06** + **FRICTION-05** (breaking change). |
| ~~TRAIDE BUG-1~~ (naïve) Tempo always fails polling | **Fixed in fork:** `lib/web3/chain-adapter/evm.ts` uses `waitForReceiptByHash` for Tempo (`TEMPO_CHAIN_IDS`). Re-file only if **production** still fails — see **BUG-07**. |
| ~~TRAIDE BUG-2~~ (naïve) Memo gas always too low | **Fixed in fork:** `TEMPO_MEMO_MIN_GAS = 300_000` in `plugins/tempo/steps/tempo-tx-core.ts`. Re-file if **generic MCP path** bypasses floor — see **BUG-08**. |

---

## 🔴 BUG REPORTS (reproducible)

### BUG-01 · `pnpm dev:login` crashes silently on migration drift

**Severity:** High — blocks first-time contributors  
**File:** `scripts/dev-login.ts` → `runStep()`  
**Fork:** Lines 94–108 — `spawnSync` with `stdio: "inherit"`; child stderr not captured

**Steps:**
1. Clone keeperhub, run `pnpm db:push` manually
2. Run `pnpm dev:login`

**Expected:** Actionable error or auto-recovery  
**Actual:** Exit code 1, often no useful output

**Fix:** Pipe stderr; detect `relation already exists`; run backfill script — see [PRs.md](PRs.md) PR 2

---

### BUG-02 · Web sign-in does not sync `kh_...` API key to MCP agents

**Severity:** High  
**Surface:** KeeperHub Web App auth vs MCP  
**Fork:** `lib/mcp/oauth-auth.ts` — OAuth path rejects `kh_` tokens; no `/api/me/token` for key handoff

**Impact:** Every external agent (including NexusAgent) needs manual copy-paste + KeeperHub Sync modal.

**Fix:** OAuth handshake returns org API key, or `/api/me/token` after session.

---

### BUG-03 · `CHAIN_MISMATCH` breaks workflow list instead of filtering

**Severity:** Medium  
**Surface:** My Workflows when workspace chain ≠ workflow chain  
**Fork:** `lib/agentic-wallet/workflow-binding.ts:274` — returns `code: "CHAIN_MISMATCH"`  
**Also:** Deplex team

**Expected:** Chain badge + “inactive on this network”  
**Actual:** Page-level error

**Fix:** Filter or degrade gracefully in UI; never throw for entire list.

---

### BUG-04 · MCP `create_workflow` cold-start timeout / stub IDs

**Severity:** Medium (intermittent)  
**Surface:** First MCP call after idle  

**Expected:** Real workflow ID  
**Actual:** Timeout or stub-like ID; second call succeeds  

**NexusAgent workaround:** Retry + stub detection in `mcp-client.ts`. Warm with `pnpm run surfaces`.

**Fix:** Server-side retry or documented warm-up; MCP handler backoff.

---

### BUG-05 · Onboarding chips accept `walletAddress` but never use it

**Severity:** Medium  
**File:** `lib/onboarding/getting-started-config.ts`  
**Fork:** Lines 108–110 — comment says *“Reserved for future holdings scanner. Unused while static.”*

**Expected:** Sepolia contract addresses injected into chip prompts  
**Actual:** Generic prompts; builders hunt addresses externally

**Fix:** [PRs.md](PRs.md) PR 1 — inject Aave/Uniswap Sepolia addresses when testnet context detected.

---

### BUG-06 · `get_execution_logs` removed without MCP migration shim

**Severity:** Medium — breaks existing agents  
**Fork:** `tests/unit/mcp-meta-tools-merger.test.ts` — tool not registered; `get_execution` replaces it  
**Also:** `data/agent-registry.json:129` still lists deprecated `get_execution_logs`

**Expected:** Deprecation alias or registry update  
**Actual:** Agents calling old tool name fail silently or 404

**Fix:** Register alias `get_execution_logs` → `get_execution`; update agent-registry.json.

---

### BUG-07 · Tempo execution may still report FAILED on production (polling path)

**Severity:** High on Tempo — agent double-spend risk  
**Fork fix exists:** `evm.ts:314–368` `waitForReceiptByHash` for Tempo 0x76 txs  
**Reporter:** TRAIDE Keeper (tx hashes cited on Discord)

**Repro:** Run Tempo `transfer-with-memo` via KeeperHub; confirm nonce advances but execution status = failed with `invalid BigNumberish value (value=null), code=BAD_DATA`.

**Action for bounty:** Reproduce on **production** `app.keeperhub.com`. If still broken → deployment lag bug. If fixed → close.

---

### BUG-08 · `execute_contract_call` may bypass Tempo memo gas floor

**Severity:** Medium  
**Fork:** Memo floor in `tempo-tx-core.ts` (`TEMPO_MEMO_MIN_GAS = 300_000`); generic MCP `execute_contract_call` may not apply it  
**Reporter:** TRAIDE — needed `gas_limit_multiplier: 8` for memo transfer

**Expected:** Memo transfers estimate ≥ ~272k gas automatically  
**Actual:** ~53k estimate → node rejects broadcast

**Fix:** Apply `applyTempoMemoGasFloor` on all Tempo write paths, including `/api/execute/contract-call`.

---

### BUG-09 · Free-tier workflow templates fail on notify/compute nodes (`402 upgrade_required`)

**Severity:** Medium — hackathon blocker for Discord/webhook demos  
**Reporter:** ApprovalSentinel (documented in their README)

**Expected:** Template gallery badges “Pro required for notify leg”  
**Actual:** Schedule/event → notify workflows fail at runtime on free org

**Fix:** Free-tier template variants (on-chain read only) or clear upgrade CTA at create time.

---

## 🟡 FRICTION POINTS (UX / DX)

### FRICTION-01 · Webhook trigger URLs require `wfb_` key but errors only mention `kh_`

**Severity:** High DX  
**Fork:** `lib/api-key-auth.ts` — validates `kh_` prefix only; no distinction for workflow webhook triggers

**Actual failure:** `{ "error": "Unauthorized" }` or *"Expected key starting with kh_"* when using org key on webhook URL.

**Fix:**
```json
{
  "error": "wrong_key_type",
  "detail": "Webhook triggers require a wfb_ workflow-builder key",
  "hint": "Create one at Settings → API Keys → Workflow Builder",
  "docs": "https://docs.keeperhub.com/keys"
}
```

---

### FRICTION-02 · No MCP `validate_cron` tool

**Severity:** Medium  
**Impact:** NexusAgent built `humanCron()` + `cron-evaluator.ts` locally; wrong cron silently misfires.

**Fix:** MCP tool returning `{ isValid, humanReadable, nextFiveFireTimes[] }`.

---

### FRICTION-03 · Sign & Hold / Tempo nodes not exposed in MCP `list_tools`

**Severity:** High for Guardian pre-sign story  
**Fork:** Tempo plugins exist (`plugins/tempo/`); no `tempo_sign_and_hold` / `tempo_release_hold` in `lib/mcp/tools.ts`

**Fix:** Expose hold/release/cancel as MCP tools for agent pre-sign liquidation rescue.

---

### FRICTION-04 · No wallet-scoped execution history pagination in MCP

**Severity:** Medium  
**Fork:** `get_execution` paginates per executionId with `truncateData`; no `{ walletAddress, cursor, limit }` for org-wide audit sync

**Impact:** NexusAgent maintains own Postgres `executions_log` (dual source of truth).

**Fix:** `list_executions({ wallet, cursor, limit, status?, action? })`.

---

### FRICTION-05 · Breaking MCP rename `get_execution_logs` → `get_execution` undocumented for builders

**Severity:** Medium  
**Related:** BUG-06

**Fix:** Changelog entry + MCP server startup warning when clients request removed tool names.

---

### FRICTION-06 · No `test_notification` MCP tool

**Severity:** Medium  
**Impact:** Cannot test Discord/Telegram alert UX without firing a full workflow execution.

**Fix:** `test_notification({ channel, message })` — standard on Zapier/Make.

---

### FRICTION-07 · Spending ceiling not readable/updatable via MCP

**Severity:** Low–Medium  
**Impact:** NexusAgent duplicates state in `repayment_cycles` Postgres table.

**Fix:** `get_spending_limits(wallet)` / `update_spending_limit(wallet, ceilingUSD)`.

---

### FRICTION-08 · Structured API error envelope not used consistently

**Severity:** Medium  
**Fork:** `lib/errors/api-envelope.ts` (KEEP-489) defines `{ error, detail, hint, docs, request_id }` but many routes still return bare `"Unauthorized"` strings.

**Fix:** Migrate auth and workflow routes to `apiError()` helper.

---

### FRICTION-09 · KeeperHub `/executions/{id}` deep links 404 for external viewers

**Severity:** Medium (judge / demo UX)  
**Repro:** Open `https://app.keeperhub.com/executions/80bk5zy4fwdfedy3w1rdi` while signed into a different org or logged out → **404 This page could not be found.** On-chain proof is valid; link is not shareable like BaseScan/Tempo Explorer.

**Impact:** Hackathon submissions cannot cite execution URLs as public proof. Teams must fall back to explorer tx links or in-app Activity (org-scoped).

**Workaround:** NexusAgent dashboard [`/tempo`](https://spirited-heart-production-b5c5.up.railway.app/tempo) links **Tempo Explorer** + workflow ids only. Documented in [COMPETITIVE_POSITION.md](docs/COMPETITIVE_POSITION.md).

**Fix:** Public read-only execution share URLs (token or slug) **or** redirect `/executions/{id}` to workflow run tab when viewer lacks org access.

---

## 📊 Summary table

| ID | Type | Severity | Status |
|----|------|----------|--------|
| BUG-01 | Bug | 🔴 High | PR drafted |
| BUG-02 | Bug | 🔴 High | Workaround: KH Sync modal |
| BUG-03 | Bug | 🟠 Medium | Deplex + NexusAgent |
| BUG-04 | Bug | 🟠 Medium | Client retry workaround |
| BUG-05 | Bug | 🟠 Medium | PR drafted |
| BUG-06 | Bug | 🟠 Medium | New — fork verified |
| BUG-07 | Bug | 🔴 High (Tempo) | Repro on prod: **passed** — 4× `tempo:proof` mined (latest [`0x36a595…`](https://explore.testnet.tempo.xyz/tx/0x36a595cace20493791aeab8400f7ff9633fcafbbb3c5da136604658cde1554fd)) |
| BUG-08 | Bug | 🟠 Medium | New — fork verified |
| BUG-09 | Bug | 🟠 Medium | New — ApprovalSentinel aligned |
| FRICTION-01 | DX | 🔴 High | New (narrowed from old F-02) |
| FRICTION-02 | DX | 🟡 Medium | Open |
| FRICTION-03 | DX | 🔴 High | Open — blocks Sign & Hold |
| FRICTION-04 | DX | 🟡 Medium | Open |
| FRICTION-05 | DX | 🟡 Medium | Open |
| FRICTION-06 | DX | 🟡 Medium | Open |
| FRICTION-07 | DX | 🟢 Low | Open |
| FRICTION-08 | DX | 🟡 Medium | New — KEEP-489 partial |
| FRICTION-09 | UX | 🟡 Medium | New — execution deep link 404 |

**Counts:** 9 bugs · 9 frictions · **18 total** (was 12)

---

## 🚀 NexusAgent Sign & Hold integration (when FRICTION-03 resolved)

```
HF drops below 1.40 (warning)
  → build + simulate repay calldata
  → tempo_sign_and_hold(payload, validityWindow=7200s)
  → store holdId in Postgres

HF drops below 1.15 (critical)
  → tempo_release_hold(holdId)   # ~0.5s vs ~3–5s reactive path
```

Submission line: *"Pre-signed rescue at warning band; release at critical — Sign & Hold on KeeperHub Tempo."*

---

## 🔬 How to re-verify (no clone needed if fork exists)

```bash
# Your fork (already at C:\Users\maitr\Downloads\keeperhub)
rg "waitForReceiptByHash" lib/web3/chain-adapter/evm.ts
rg "get_execution_logs" lib/mcp tests data
rg "walletAddress" lib/onboarding/getting-started-config.ts

# NexusAgent DB
pnpm --prefix nexus-agent exec tsx src/scripts/db-audit.ts
```

**Optional clones for competitor cross-check (you run these):**
```bash
git clone https://github.com/webski101/deplex.git
git clone https://github.com/yangyangnovelist-hub/approval-sentinel.git
```

Not required for bounty filing — public READMEs + your fork verification suffice.

---

*Filed by NexusAgent · Reproducible on request during judging · [PLAN.md](PLAN.md) for full win roadmap*
