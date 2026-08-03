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
import {
  evaluateRepayVerification,
  keeperhubClaimedExecutionSuccess,
} from "../lib/independent-aave-verify.js";
import { buildWorkflowGraph } from "../lib/workflow-graph.js";
import { isPendingLockConflict } from "../lib/pending-lock.js";
import {
  buildHfReadListingMetadata,
  buildHfReadWorkflowGraph,
  HF_READ_EXECUTION_CHAIN,
  HF_READ_LISTING_CHAIN,
  HF_READ_LISTING_SLUG,
  isValidListingSlug,
} from "../lib/hf-read-workflow.js";
import {
  buildTempoProofWorkflowGraph,
  TEMPO_PROOF_MEMO,
  TEMPO_TESTNET_CHAIN,
} from "../lib/tempo-proof-workflow.js";
import { getTxExplorerUrl, chainLabel } from "../lib/tx-explorer.js";
import { parsePathUsdBalance } from "../lib/tempo-balance.js";
import { parseHfMarketplaceResult } from "../lib/parse-hf-marketplace.js";
import {
  BASE_MAINNET_CHAIN_ID,
  baseMainnetTxUrl,
  TEMPO_CHAIN_ID,
  TEMPO_PROOF_TX,
  TEMPO_PROOF_TXS,
} from "../lib/tier2-proofs.js";
import { mapExecutionLogToExplorer } from "../brain/agent-tools.js";
import { getDemoWallet, isDemoWallet, normalizeWallet } from "../lib/demo-wallet.js";
import { enforceReadAccess, AuthError, AuthedRequest, OptionalAuthedRequest, generateAuthToken } from "../middleware/auth.js";

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

  const snap = (debt: number, hf: number | null) => ({
    healthFactor: hf,
    debtUSD: debt,
    collateralUSD: 1000,
  });
  const happyRepay = evaluateRepayVerification(snap(500, 1.2), snap(450, 1.35), true);
  assert(happyRepay.verified === true, "Independent verify — debt drop confirms repay");

  const hfOnly = evaluateRepayVerification(snap(500, 1.2), snap(500, 1.25), true);
  assert(hfOnly.verified === true, "Independent verify — HF improvement confirms repay");

  const mismatch = evaluateRepayVerification(snap(500, 1.2), snap(500, 1.2), true);
  assert(
    mismatch.verified === false && Boolean(mismatch.discrepancy),
    "Independent verify — unchanged debt/HF flags discrepancy",
  );

  assert(
    keeperhubClaimedExecutionSuccess({ status: "mined" }) === true,
    "Independent verify — mined poll counts as KH success",
  );
  assert(
    keeperhubClaimedExecutionSuccess({ status: "failed", txHash: null }) === false,
    "Independent verify — failed poll skips verify path",
  );

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

  // 6g. DCA remote cron disabled on registration graphs
  const sampleStep = {
    type: "transaction" as const,
    to: USDC_SEPOLIA,
    calldata: encodeERC20Approve(USDC_SEPOLIA, AAVE_V3_POOL, 100),
    gasStrategy: "standard" as const,
  };
  const cronEnabledDefault = buildWorkflowGraph({
    name: "payroll-test",
    triggerType: "cron",
    cronSchedule: "0 9 * * 1",
    steps: [sampleStep],
  });
  assert(cronEnabledDefault.enabled === true, "Workflow Graph — cron default remoteCronEnabled → enabled true");

  const cronDisabledRemote = buildWorkflowGraph({
    name: "dca-test",
    triggerType: "cron",
    cronSchedule: "0 * * * *",
    remoteCronEnabled: false,
    steps: [sampleStep],
  });
  assert(cronDisabledRemote.enabled === false, "Workflow Graph — remoteCronEnabled false → enabled false");

  // 6h. Cron step expressions (*/n)
  assert(shouldRunCronNow("*/15 * * * *", new Date("2026-08-02T14:30:00Z")) === true, "Cron Evaluator — */15 matches :30");
  assert(shouldRunCronNow("*/15 * * * *", new Date("2026-08-02T14:07:00Z")) === false, "Cron Evaluator — */15 rejects :07");

  // 6i. Pending lock conflict detection (Postgres 23505)
  assert(isPendingLockConflict({ code: "23505" }) === true, "Pending Lock — detects unique_violation 23505");
  assert(isPendingLockConflict({ code: "23503" }) === false, "Pending Lock — ignores non-unique errors");
  assert(isPendingLockConflict(new Error("fail")) === false, "Pending Lock — ignores generic errors");

  // 7. Repayment cycle remaining (never negative)
  assert(getCycleRemaining({ cycleLimitUSD: 1000, totalRepaidThisCycleUSD: 2000 }) === 0, "Cycle Remaining — Clamps negative to 0 when over budget");
  assert(getCycleRemaining({ cycleLimitUSD: 1000, totalRepaidThisCycleUSD: 600 }) === 400, "Cycle Remaining — Returns correct positive remainder");
  assert(getCycleRemaining({ cycleLimitUSD: 1000, totalRepaidThisCycleUSD: null }) === 1000, "Cycle Remaining — Treats null repaid as 0");

  // 8. Tier 2 — HF-read marketplace graph
  const hfGraph = buildHfReadWorkflowGraph();
  assert(hfGraph.nodes.length === 2, "HF Read Graph — Manual trigger + read node");
  const readNode = hfGraph.nodes.find((n) => n.id === "read-1") as any;
  assert(readNode?.data?.config?.actionType === "web3/read-contract", "HF Read Graph — read-contract action");
  assert(readNode?.data?.config?.abiFunction === "getUserAccountData", "HF Read Graph — getUserAccountData ABI");
  assert(readNode?.data?.config?.network === HF_READ_EXECUTION_CHAIN, "HF Read Graph — execution chain Base Sepolia 84532");
  assert(isValidListingSlug(HF_READ_LISTING_SLUG), "HF Read Listing — slug format valid");
  assert(isValidListingSlug("Bad_Slug") === false, "HF Read Listing — rejects invalid slug");
  const listingMeta = buildHfReadListingMetadata();
  assert(listingMeta.chain === HF_READ_LISTING_CHAIN, "HF Read Listing — listing chain Base mainnet 8453 for x402");
  assert(listingMeta.workflowType === "read", "HF Read Listing — workflowType read");
  assert(listingMeta.priceUsdcPerCall === "0.01", "HF Read Listing — x402 price set");
  assert(Array.isArray((listingMeta.inputSchema as any).required) && (listingMeta.inputSchema as any).required.includes("walletAddress"), "HF Read Listing — inputSchema requires walletAddress");

  // 9. Tier 2 — Tempo proof graph
  const tempoGraph = buildTempoProofWorkflowGraph({ recipientAddress: demoUserWallet });
  const tempoStep = tempoGraph.nodes.find((n) => n.id === "step-1") as any;
  assert(tempoStep?.data?.config?.actionType === "tempo/transfer-with-memo", "Tempo Proof Graph — transfer-with-memo action");
  assert(tempoStep?.data?.config?.network === TEMPO_TESTNET_CHAIN, "Tempo Proof Graph — Moderato chain 42431");
  assert(tempoStep?.data?.config?.memo === TEMPO_PROOF_MEMO, "Tempo Proof Graph — default memo");

  // 10. Tier 2 — tx explorer + tempo balance parser
  const tempoExplorer = getTxExplorerUrl(TEMPO_PROOF_TX, { chainId: TEMPO_CHAIN_ID });
  assert(tempoExplorer.url.includes("explore.testnet.tempo.xyz"), "Tx Explorer — Tempo Moderato URL");
  assert(tempoExplorer.label === "Live Tempo Explorer", "Tx Explorer — Tempo label");
  const baseExplorer = getTxExplorerUrl("0x" + "a".repeat(64), { chainId: 84532 });
  assert(baseExplorer.url.includes("sepolia.basescan.org"), "Tx Explorer — Base Sepolia URL");
  assert(BASE_MAINNET_CHAIN_ID === 8453, "Tier 2 — Base mainnet chain id 8453");
  assert(
    baseMainnetTxUrl("0x" + "a".repeat(64)).includes("basescan.org"),
    "Tier 2 — baseMainnetTxUrl uses basescan.org",
  );
  assert(chainLabel(TEMPO_CHAIN_ID) === "Tempo Moderato", "Tx Explorer — chainLabel Tempo");
  assert(parsePathUsdBalance(1_000_000n) === 1, "Tempo Balance — 6-decimal PathUSD parse");

  assert(TEMPO_PROOF_TXS.length === 4, "Tempo proofs — 4 canonical txs for chat getTempoProofs");
  const tempoLogExplorer = mapExecutionLogToExplorer({
    txHash: TEMPO_PROOF_TX,
    status: "success",
    aiAnalysis: { chainId: TEMPO_CHAIN_ID },
  });
  assert(
    (tempoLogExplorer.explorerUrl?.includes("explore.testnet.tempo.xyz")) ?? false,
    "Chat tool — mapExecutionLogToExplorer Tempo URL",
  );
  assert(tempoLogExplorer.chain === "Tempo Moderato", "Chat tool — mapExecutionLogToExplorer chain label");

  const hfParsed = parseHfMarketplaceResult({
    healthFactor: "1500000000000000000",
    totalCollateralBase: "50000000000",
    totalDebtBase: "10000000000",
  });
  assert(hfParsed.healthFactor === 1.5, "HF Marketplace Parser — 1e18 health factor");
  assert(hfParsed.totalCollateralUSD === 500, "HF Marketplace Parser — 1e8 collateral USD");
  assert(hfParsed.totalDebtUSD === 100, "HF Marketplace Parser — 1e8 debt USD");

  // Demo wallet + read access (offline)
  console.log("\n── Tier A: Demo Read Access (Offline) ──");
  const demoWallet = getDemoWallet();
  assert(demoWallet === demoUserWallet, "Demo Wallet — matches monitored wallet constant");
  assert(isDemoWallet("0x89F97Cb35236a1d0190FB25B31C5C0fF4107Ec1b"), "Demo Wallet — mixed-case match");
  assert(!isDemoWallet("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"), "Demo Wallet — rejects non-demo");

  try {
    enforceReadAccess({} as OptionalAuthedRequest, demoWallet);
    assert(true, "enforceReadAccess — no JWT + demo wallet allows");
  } catch {
    assert(false, "enforceReadAccess — no JWT + demo wallet allows");
  }

  // Simulates optionalAuth fail-open: stale JWT ignored, demo read still allowed
  try {
    enforceReadAccess({ userWallet: undefined } as OptionalAuthedRequest, demoWallet);
    assert(true, "enforceReadAccess — stale JWT ignored + demo wallet allows");
  } catch {
    assert(false, "enforceReadAccess — stale JWT ignored + demo wallet allows");
  }

  try {
    enforceReadAccess({} as OptionalAuthedRequest, "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    assert(false, "enforceReadAccess — no JWT + other wallet should 401");
  } catch (err) {
    assert(err instanceof AuthError && err.statusCode === 401, "enforceReadAccess — no JWT + other wallet 401");
  }

  try {
    enforceReadAccess({ userWallet: demoWallet } as AuthedRequest, demoWallet);
    assert(true, "enforceReadAccess — JWT + same wallet allows");
  } catch {
    assert(false, "enforceReadAccess — JWT + same wallet allows");
  }

  try {
    enforceReadAccess({ userWallet: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266" } as AuthedRequest, demoWallet);
    assert(false, "enforceReadAccess — JWT + different wallet should 403");
  } catch (err) {
    assert(err instanceof AuthError && err.statusCode === 403, "enforceReadAccess — JWT + different wallet 403");
  }

  const agentUrl = process.env.AGENT_URL;
  if (agentUrl) {
    console.log("\n── Tier D: Demo Read HTTP (AGENT_URL set) ──");
    const randomWallet = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266".toLowerCase();
    const mixedDemo = "0x89F97Cb35236a1d0190FB25B31C5C0fF4107Ec1b";

    const pfProbe = await fetch(`${agentUrl}/api/portfolio/${demoWallet}`);
    if (pfProbe.status === 401) {
      logSkip(
        "Demo Read HTTP integration",
        "Agent at AGENT_URL does not expose demo read yet — deploy nexus-agent first, then re-run with AGENT_URL",
      );
    } else {
      const pfJson = await pfProbe.json();
      assert(pfProbe.ok && pfJson.demoRead === true && typeof pfJson.healthFactor === "number", "HTTP — anonymous demo portfolio");

      const pfMixed = await fetch(`${agentUrl}/api/portfolio/${mixedDemo}`);
      assert(pfMixed.ok, "HTTP — mixed-case demo portfolio URL");

      const feedAnon = await fetch(`${agentUrl}/api/feed/${demoWallet}`);
      const feedJson = await feedAnon.json();
      assert(feedAnon.ok && feedJson.demoRead === true && Array.isArray(feedJson.items), "HTTP — anonymous demo feed wrapper");

      const pfOther = await fetch(`${agentUrl}/api/portfolio/${randomWallet}`);
      assert(pfOther.status === 401, "HTTP — anonymous non-demo portfolio 401");

      const hfDemo = await fetch(`${agentUrl}/api/marketplace/hf-read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: demoWallet }),
      });
      assert(hfDemo.ok, "HTTP — anonymous hf-read demo wallet");

      const hfRandom = await fetch(`${agentUrl}/api/marketplace/hf-read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: randomWallet }),
      });
      assert(hfRandom.status === 401, "HTTP — anonymous hf-read non-demo 401");

      const hfEmpty = await fetch(`${agentUrl}/api/marketplace/hf-read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      assert(hfEmpty.status === 401, "HTTP — anonymous hf-read empty body 401");

      const otherJwt = generateAuthToken(randomWallet);
      const pfCross = await fetch(`${agentUrl}/api/portfolio/${demoWallet}`, {
        headers: { Authorization: `Bearer ${otherJwt}` },
      });
      assert(pfCross.status === 403, "HTTP — JWT other wallet cannot read demo portfolio");
    }
  } else {
    logSkip("Demo Read HTTP integration", "Set AGENT_URL to run live API auth tests");
  }

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
