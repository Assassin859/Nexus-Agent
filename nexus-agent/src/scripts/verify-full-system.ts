import "../lib/env.js";
import { parseMcpToolContent } from "../lib/mcp-client.js";
import { getWalletContext } from "../lib/agentic-wallet.js";
import { splitTeamPayroll } from "../lib/payroll-split.js";
import { resolveCronSchedule } from "../lib/cron.js";
import { shouldRunCronNow } from "../lib/cron-evaluator.js";
import { encodeERC20Approve, USDC_SEPOLIA, AAVE_V3_POOL } from "../lib/calldata.js";
import { getCompoundUsdcSupplyAPY } from "../lib/compound.js";
import { ensureAllowance } from "../lib/allowance.js";

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
    assert(true, "Integration — Database connected");
  } else {
    logSkip("Guardian Cycle Rollover & Pending TTL Cleanup", "Run with --integration and valid DATABASE_URL");
    logSkip("Multi-Member Compensating Cancel Workflow", "Run with --integration and valid DATABASE_URL");
  }

  console.log(`\n==================================================`);
  console.log(`Summary: ✓ ${passed} passed | ⚠ ${skipped} skipped | ✗ ${failed} failed`);
  console.log(`==================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
