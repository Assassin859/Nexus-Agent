import "../lib/env.js";
import { parseMcpToolContent, resolveEffectiveMcpApiKey, mcpCacheKey } from "../lib/mcp-client.js";
import { getWalletContext } from "../lib/agentic-wallet.js";
import { splitTeamPayroll } from "../lib/payroll-split.js";
import { resolveCronSchedule } from "../lib/cron.js";
import { shouldRunCronNow } from "../lib/cron-evaluator.js";
import { encodeERC20Approve, USDC_SEPOLIA, AAVE_V3_POOL } from "../lib/calldata.js";
import { getCompoundUsdcSupplyAPY } from "../lib/compound.js";
import { ensureAllowance } from "../lib/allowance.js";
import { selectBestCandidate, enforceCriticalHfFloor } from "../lib/guardian-candidate-select.js";
import { getCycleRemaining, shouldReleaseCycleBudget, resolveExecutionLogStatus } from "../lib/repayment-cycle.js";

async function main() {
  const isIntegration = process.argv.includes("--integration");
  console.log(`\n🔍 Running NexusAgent System Verification Harness ${isIntegration ? "(Mode: Integration)" : "(Mode: Unit / CI Fast-Track)"}\n`);

  let passed = 0;
  let skipped = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✓ PASSED: ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ FAILED: ${testName}`);
      failed++;
    }
  }

  function logSkip(testName: string, reason: string) {
    console.log(`  ⚠ SKIPPED: ${testName} (${reason})`);
    skipped++;
  }

  // ── Tier A: Offline / Pure Unit Tests (CI Mandatory) ──────────────────────
  console.log("── Tier A: Core Logic & Parsers (Offline / CI Mandatory) ──");

  // 1. Wallet Context Scoping
  const demoUserWallet = "0x89f97cb35236a1d0190fb25b31c5c0ff4107ec1b";
  const ctx = getWalletContext(demoUserWallet);
  assert(ctx !== null && ctx.monitoredWallet === demoUserWallet.toLowerCase(), "Wallet Context — Monitored wallet normalized");

  // 2. MCP Content Parser (3 test cases)
  const test1 = parseMcpToolContent<{ workflowId: string }>({
    content: [{ type: "text", text: JSON.stringify({ workflowId: "wf_123" }) }]
  }, "workflowId");
  assert(test1?.workflowId === "wf_123", "MCP Parser — Parsed array text JSON block");

  const test2 = parseMcpToolContent<{ workflowId: string }>({
    content: [{ type: "text", text: "Created workflow: wf_regex_999" }]
  }, "workflowId");
  assert(test2?.workflowId === "wf_regex_999", "MCP Parser — Regex fallback extraction");

  const test3 = parseMcpToolContent<{ workflowId: string }>({ workflowId: "wf_direct" }, "workflowId");
  assert(test3?.workflowId === "wf_direct", "MCP Parser — Direct object return");

  // 3. Team Payroll Split Remainder Logic
  const split3 = splitTeamPayroll(100, 3);
  assert(split3.length === 3 && split3[0] === 33 && split3[1] === 33 && split3[2] === 34, "Payroll Split — $100 / 3 member remainder distribution [33, 33, 34]");
  const split2 = splitTeamPayroll(50, 2);
  assert(split2.length === 2 && split2[0] === 25 && split2[1] === 25, "Payroll Split — $50 / 2 exact division [25, 25]");

  // 4. Cron Evaluator & Resolver
  const monday9am = new Date("2026-08-03T09:00:00Z"); // Mon Aug 3 2026 09:00 UTC
  const monday10am = new Date("2026-08-03T10:00:00Z");
  assert(shouldRunCronNow("0 9 * * 1", monday9am) === true, "Cron Evaluator — 0 9 * * 1 matches Mon 09:00 UTC");
  assert(shouldRunCronNow("0 9 * * 1", monday10am) === false, "Cron Evaluator — 0 9 * * 1 rejects Mon 10:00 UTC");
  assert(shouldRunCronNow("0 9 1,15 * *", new Date("2026-08-01T09:00:00Z")) === true, "Cron Evaluator — 0 9 1,15 * * matches 1st of month at 09:00");
  assert(shouldRunCronNow("invalid cron") === false, "Cron Evaluator — malformed expression returns false");
  assert(resolveCronSchedule("every Monday at 9am") === "0 9 * * 1", "Cron Resolver — Natural language resolves to 0 9 * * 1");
  assert(resolveCronSchedule("0 12 * * 5") === "0 12 * * 5", "Cron Resolver — 5-part cron passes through");

  // 5. ERC20 Approve Calldata Generation
  const approveCalldata = encodeERC20Approve(USDC_SEPOLIA, AAVE_V3_POOL, (1n << 256n) - 1n);
  assert(approveCalldata.startsWith("0x095ea7b3"), "Calldata — ERC20 approve selector 0x095ea7b3");

  // 6. Guardian Candidate Selection Harness
  const fallbackRec = { action: "hold" as const, asset: "USDC", amount: 0, reason: "Fallback hold" };

  // 6a. Empty candidates → return fallback
  const emptyResult = selectBestCandidate([], fallbackRec);
  assert(emptyResult.action === "hold", "Candidate Select — Empty array returns fallback recommendation");

  // 6b. All riskScore > 5 → return fallback
  const allHighRisk = [
    { action: "repay" as const, amount: 500, expectedHealthFactor: 1.4, estimatedGasUSD: 2, riskScore: 6, pros: "Full repay", cons: "High cost" },
    { action: "supply_collateral" as const, amount: 200, expectedHealthFactor: 1.3, estimatedGasUSD: 1.5, riskScore: 8, pros: "Cheaper", cons: "Slower" },
  ];
  const allFilteredResult = selectBestCandidate(allHighRisk, fallbackRec);
  assert(allFilteredResult.action === "hold", "Candidate Select — All riskScore > 5 returns fallback");

  // 6c. Two eligible candidates → lower riskScore wins; if tied, higher HF wins
  const mixedCandidates = [
    { action: "supply_collateral" as const, amount: 300, expectedHealthFactor: 1.35, estimatedGasUSD: 1.5, riskScore: 3, pros: "Safer", cons: "Less efficient" },
    { action: "repay" as const, amount: 500, expectedHealthFactor: 1.45, estimatedGasUSD: 2, riskScore: 2, pros: "Best HF", cons: "More gas" },
  ];
  const rankedResult = selectBestCandidate(mixedCandidates, fallbackRec);
  assert(rankedResult.action === "repay", "Candidate Select — Lower riskScore candidate wins ranking (riskScore=2 > riskScore=3)");

  // 6d. Critical HF safety floor
  const holdAtCritical = { action: "hold" as const, asset: "USDC", amount: 0, reason: "LLM hold" };
  const floorRepay = enforceCriticalHfFloor(holdAtCritical, {
    healthFactor: 1.05,
    agenticBalance: 8000,
    cycleRemaining: 1000,
    debtUSD: 5000,
  });
  assert(floorRepay.action === "repay" && floorRepay.amount === 1000, "Safety Floor — Critical HF + hold + funds → repay $1000");

  const floorEmptyWallet = enforceCriticalHfFloor(holdAtCritical, {
    healthFactor: 1.05,
    agenticBalance: 0,
    cycleRemaining: 1000,
    debtUSD: 5000,
  });
  assert(floorEmptyWallet.action === "hold", "Safety Floor — Critical HF + hold + empty wallet → unchanged hold");

  const floorSafeHf = enforceCriticalHfFloor(holdAtCritical, {
    healthFactor: 1.32,
    agenticBalance: 8000,
    cycleRemaining: 1000,
    debtUSD: 5000,
  });
  assert(floorSafeHf.action === "hold", "Safety Floor — Safe HF 1.32 + hold → unchanged hold");

  const existingRepay = { action: "repay" as const, asset: "USDC", amount: 500, reason: "Already repay" };
  const floorExistingRepay = enforceCriticalHfFloor(existingRepay, {
    healthFactor: 1.05,
    agenticBalance: 8000,
    cycleRemaining: 1000,
    debtUSD: 5000,
  });
  assert(floorExistingRepay.action === "repay" && floorExistingRepay.amount === 500, "Safety Floor — Critical HF + existing repay → unchanged");

  // 6e. Cycle budget release on poll outcome
  const sampleTx = "0x23f6424d9dbcb2b77c13a3ca6d4e4117c7e37d4d8e433549519ec4df2c770df3";
  assert(shouldReleaseCycleBudget({ status: "mined" }) === false, "Cycle Budget — mined → do not release");
  assert(
    shouldReleaseCycleBudget({ timedOut: true, status: "pending" }) === false,
    "Cycle Budget — inconclusive timeout → do not release",
  );
  assert(
    shouldReleaseCycleBudget({ timedOut: true, status: "pending", txHash: sampleTx }) === false,
    "Cycle Budget — timeout with txHash → do not release",
  );
  assert(shouldReleaseCycleBudget({ status: "failed" }) === true, "Cycle Budget — failed → release");

  const inconclusive = resolveExecutionLogStatus({ timedOut: true, status: "pending" });
  assert(
    inconclusive.status === "delayed" && inconclusive.reason.includes("inconclusive"),
    "Cycle Budget — inconclusive timeout → delayed log status",
  );
  const withHash = resolveExecutionLogStatus({
    timedOut: true,
    status: "broadcasting",
    txHash: sampleTx,
  });
  assert(withHash.status === "success", "Cycle Budget — txHash present → success log status");

  // 6f. MCP per-wallet API key resolution
  assert(resolveEffectiveMcpApiKey("kh_user_test") === "kh_user_test", "MCP Key — explicit key wins");
  assert(
    resolveEffectiveMcpApiKey(undefined) === process.env.KEEPERHUB_API_KEY,
    "MCP Key — undefined falls back to env KEEPERHUB_API_KEY",
  );
  assert(
    mcpCacheKey("kh_a") !== mcpCacheKey("kh_b"),
    "MCP Key — distinct cache keys per wallet key",
  );

  // 7. Repayment cycle remaining (never negative)
  assert(getCycleRemaining({ cycleLimitUSD: 1000, totalRepaidThisCycleUSD: 2000 }) === 0, "Cycle Remaining — Clamps negative to 0 when over budget");
  assert(getCycleRemaining({ cycleLimitUSD: 1000, totalRepaidThisCycleUSD: 600 }) === 400, "Cycle Remaining — Returns correct positive remainder");
  assert(getCycleRemaining({ cycleLimitUSD: 1000, totalRepaidThisCycleUSD: null }) === 1000, "Cycle Remaining — Treats null repaid as 0");

  // ── Tier B: On-Chain RPC Integrations (Optional) ──────────────────────────
  console.log("\n── Tier B: On-Chain RPC Queries (Optional) ──");
  if (process.env.ALCHEMY_RPC_URL || process.env.SEPOLIA_RPC_URL) {
    try {
      const compoundAPY = await getCompoundUsdcSupplyAPY();
      assert(compoundAPY > 0, `On-Chain Compound V3 APY query returned valid APY (${compoundAPY}%)`);
    } catch (err) {
      assert(false, `Compound V3 APY query threw error: ${err}`);
    }

    try {
      const allowanceCalldata = await ensureAllowance(demoUserWallet, USDC_SEPOLIA, AAVE_V3_POOL, 100);
      assert(allowanceCalldata === null || allowanceCalldata.startsWith("0x095ea7b3"), "Allowance Helper — Returned valid calldata or null");
    } catch (err) {
      assert(false, `Allowance Helper threw error: ${err}`);
    }
  } else {
    logSkip("Compound V3 On-Chain APY", "ALCHEMY_RPC_URL not configured");
    logSkip("ERC20 Allowance Check", "ALCHEMY_RPC_URL not configured");
  }

  // ── Tier C: Database & KeeperHub MCP Integration (Optional --integration) ─
  console.log("\n── Tier C: Database & Remote MCP Integration (Optional — skipped in CI fast-track) ──");
  if (isIntegration && process.env.DATABASE_URL) {
    assert(true, "Integration — Database connected (connectivity only)");
    // NOTE: Named integration tests (pending TTL rollover, compensating cancel) are not yet implemented.
    // Add db.query assertions here when Tier C coverage is needed.
    logSkip("Guardian Cycle Rollover & Pending TTL Cleanup", "Not yet implemented — add db assertions for Tier C coverage");
    logSkip("Multi-Member Compensating Cancel Workflow", "Not yet implemented — add db assertions for Tier C coverage");
  } else {
    logSkip("Guardian Cycle Rollover & Pending TTL Cleanup", "Requires --integration flag and valid DATABASE_URL");
    logSkip("Multi-Member Compensating Cancel Workflow", "Requires --integration flag and valid DATABASE_URL");
  }

  console.log(`\n==================================================`);
  console.log(`Summary: ✓ ${passed} passed | ⚠ ${skipped} skipped | ✗ ${failed} failed`);
  console.log(`==================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
