import "./lib/env.js";

// ── 0. Production Startup Guards ────────────────────────────────────────────────
import { logger } from "./lib/logger.js";
import { getAgenticWallet, getWalletContext } from "./lib/agentic-wallet.js";

if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  logger.fatal("JWT_SECRET environment variable is required in production.");
  process.exit(1);
}

// Throw at startup (not mid-cron) if AGENTIC_WALLET_ADDRESS is missing in prod
if (process.env.NODE_ENV === "production") {
  getAgenticWallet(); // throws if unset in production
}

import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import cron from "node-cron";
import { verifyMessage } from "ethers";
import { generateText } from "ai";
import { getBrainModel, getActiveBrainProvider } from "./brain/provider.js";
import { createAgentTools } from "./brain/agent-tools.js";
import { issueSiweChallenge, consumeSiweChallenge } from "./lib/siwe-challenge.js";
import { run as runGuardian } from "./modules/guardian.js";
import { run as runYieldRotator } from "./modules/yield-rotator.js";
import { run as runDCA } from "./modules/dca.js";
import { registerDcaWorkflow } from "./modules/dca-schedule.js";
import { handle as handlePaychain } from "./modules/paychain.js";
import { syncKeeperHubState } from "./lib/keeperhub-sync.js";
import { getAavePosition } from "./lib/aave.js";
import { getCompoundUsdcSupplyAPY } from "./lib/compound.js";
import { getMarketSnapshot } from "./lib/price-feed.js";
import { shouldRunCronNow } from "./lib/cron-evaluator.js";
import { db } from "./db/client.js";
import { activeWorkflows, executionsLog, userSettings, payees, repaymentCycles } from "./db/schema.js";
import { eq, desc, and } from "drizzle-orm";
import {
  requireAuth,
  assertWalletScope,
  generateAuthToken,
  AuthedRequest,
  AuthError,
  optionalAuth,
  enforceReadAccess,
  isUnauthenticatedDemoRead,
  OptionalAuthedRequest,
} from "./middleware/auth.js";
import { demoReadLimiter } from "./middleware/demo-read-limiter.js";
import { getDemoWallet, normalizeWallet, isDemoWallet } from "./lib/demo-wallet.js";
import { resolveKeeperHubApiKey } from "./lib/user-context.js";
import { sendKeeperNotification, callListedWorkflow } from "./lib/mcp-client.js";
import { shouldAlert } from "./lib/alert-throttle.js";
import { getTempoPathUsdBalance } from "./lib/tempo-balance.js";
import { logExternalExecution } from "./lib/log-external-execution.js";
import { parseHfMarketplaceResult } from "./lib/parse-hf-marketplace.js";
import { HF_READ_SLUG, TEMPO_CHAIN_ID, tempoAddressUrl } from "./lib/tier2-proofs.js";
import { pinoHttp } from "pino-http";
import crypto from "node:crypto";

const ALLOWED_CHANNELS = ["telegram", "discord", "email"] as const;
type AlertChannel = typeof ALLOWED_CHANNELS[number];
const ALERT_CHANNEL: AlertChannel = ALLOWED_CHANNELS.includes(
  process.env.ALERT_CHANNEL as AlertChannel
) ? (process.env.ALERT_CHANNEL as AlertChannel) : "telegram";

const app = express();

// ── 1. CORS Configuration ──────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim())
  : ["http://localhost:3000", "http://localhost:3001"];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or server-to-server)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS policy violation: origin ${origin} is not allowed.`));
      }
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// ── Structured HTTP request logging ──────────────────────────────────────────
app.use(pinoHttp({
  logger,
  genReqId: () => crypto.randomUUID(),
  customLogLevel: (_req: any, res: any) =>
    res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
  serializers: {
    req: (req: any) => ({ method: req.method, url: req.url, reqId: req.id }),
    res: (res: any) => ({ statusCode: res.statusCode }),
  },
}));

// ── 2. Rate Limiting ───────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests from this IP, please try again after 15 minutes." },
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 auth requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication requests, please try again in a minute." },
});

app.use("/api/", apiLimiter);
app.use("/api/auth/", authLimiter);
app.use(demoReadLimiter);

const DEMO_WALLET = getDemoWallet();

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "nexus-agent", ts: new Date().toISOString() });
});

// ── SIWE Authentication & Challenge ─────────────────────────────────────────
app.get("/api/auth/challenge", (req, res) => {
  const wallet = (req.query.wallet as string || DEMO_WALLET).toLowerCase();
  const { challenge, timestamp } = issueSiweChallenge(wallet);
  res.json({ challenge, timestamp });
});

app.post("/api/auth/verify", async (req, res) => {
  try {
    const { walletAddress, signature, challenge } = req.body;
    if (!walletAddress || !signature || !challenge) {
      return res.status(400).json({ error: "walletAddress, signature, and challenge are required" });
    }

    const expectedAddress = walletAddress.toLowerCase();

    if (!consumeSiweChallenge(expectedAddress, challenge)) {
      return res.status(400).json({ error: "Authentication failed: Challenge not issued by server or already used." });
    }

    // 1. Verify Challenge Timestamp (<= 5 minutes old) — Fail-closed
    const tsMatch = challenge.match(/Timestamp:\s*([^\n]+)/);
    if (!tsMatch || !tsMatch[1]) {
      return res.status(400).json({ error: "Authentication failed: Challenge missing or malformed timestamp." });
    }
    const challengeTime = new Date(tsMatch[1].trim()).getTime();
    const now = Date.now();
    if (isNaN(challengeTime) || now - challengeTime > 5 * 60 * 1000) {
      return res.status(400).json({ error: "Authentication failed: Challenge has expired (> 5 minutes old)." });
    }

    // 2. Verify Embedded Wallet in Challenge matches body walletAddress
    const walletMatch = challenge.match(/Wallet:\s*(0x[a-fA-F0-9]{40})/i);
    if (walletMatch && walletMatch[1].toLowerCase() !== expectedAddress) {
      return res.status(400).json({ error: "Authentication failed: Embedded challenge wallet does not match request wallet." });
    }

    // 3. Cryptographic Signature Check (personal_sign)
    const recoveredAddress = verifyMessage(challenge, signature).toLowerCase();
    if (recoveredAddress !== expectedAddress) {
      return res.status(401).json({ error: "Cryptographic signature verification failed." });
    }

    // 4. Issue JWT Token
    const token = generateAuthToken(expectedAddress);

    // 5. User Settings Sync — PRESERVE existing custom keeperhubApiKey on re-login
    const existingSettings = await db.query.userSettings.findFirst({
      where: eq(userSettings.userWallet, expectedAddress),
    });

    if (!existingSettings) {
      await db.insert(userSettings).values({
        userWallet: expectedAddress,
        keeperhubApiKey: process.env.KEEPERHUB_API_KEY || null,
        updatedAt: new Date(),
      });
    }

    // Trigger async sync in background
    syncKeeperHubState(expectedAddress).catch(err => console.error("[SYNC ERROR]:", err));

    res.json({
      success: true,
      token,
      walletAddress: expectedAddress,
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
      message: "Signature verified! JWT auth session issued.",
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Authentication failed" });
  }
});

// ── Payees Directory API Endpoints (Protected) ───────────────────────────────
app.get("/api/payees/:walletAddress", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const authedReq = req as AuthedRequest;
    const wallet = req.params.walletAddress.toLowerCase();
    assertWalletScope(authedReq, wallet);

    const list = await db.query.payees.findMany({
      where: eq(payees.userWallet, wallet),
      orderBy: [desc(payees.createdAt)],
    });
    res.json(list);
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: err instanceof Error ? err.message : "Fetch payees failed" });
  }
});

app.post("/api/payees", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const authedReq = req as AuthedRequest;
    const wallet = authedReq.userWallet; // Force wallet scope to JWT claim

    const {
      name,
      type, // 'single' | 'team'
      payoutMode = "direct", // 'direct' | 'vault_pool'
      vaultPoolAddress,
      members = [], // Array of { name: string, address: string }
    } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: "name and type are required" });
    }

    // 1. Insert Team / Primary Payee Record
    const primary = await db.insert(payees).values({
      userWallet: wallet,
      name,
      type,
      payoutMode: type === "single" ? "direct" : payoutMode,
      vaultPoolAddress: (type === "team" && payoutMode === "vault_pool") ? vaultPoolAddress : null,
      recipientAddresses: members,
      memberCount: members.length || 1,
    }).returning();

    // 2. Auto-create Standalone Payee Entries for named members if type is team
    if (type === "team" && Array.isArray(members) && members.length > 0) {
      for (const m of members) {
        const memberAddress = m.address ? m.address.trim() : "";
        const memberName = m.name ? m.name.trim() : "";
        if (!memberName && !memberAddress) continue;

        const displayName = memberName || `Member (${memberAddress.slice(0, 6)})`;
        const existing = await db.query.payees.findFirst({
          where: and(
            eq(payees.userWallet, wallet),
            eq(payees.name, displayName)
          ),
        });

        if (!existing) {
          await db.insert(payees).values({
            userWallet: wallet,
            name: displayName,
            type: "single",
            payoutMode: "direct",
            recipientAddresses: [{ name: displayName, address: memberAddress }],
            memberCount: 1,
            parentTeamId: primary[0].id,
          });
        }
      }
    }

    res.json({ success: true, payee: primary[0] });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Create payee failed" });
  }
});

app.delete("/api/payees/all/:walletAddress", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const authedReq = req as AuthedRequest;
    const wallet = req.params.walletAddress.toLowerCase();
    assertWalletScope(authedReq, wallet);

    await db.delete(payees).where(eq(payees.userWallet, wallet));
    res.json({ success: true, message: `Cleared all payees for wallet ${wallet}` });
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: err instanceof Error ? err.message : "Clear payees failed" });
  }
});

app.delete("/api/payees/:id", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const authedReq = req as AuthedRequest;
    const { id } = req.params;

    // Database ownership check
    const payee = await db.query.payees.findFirst({
      where: eq(payees.id, id),
    });

    if (!payee || payee.userWallet.toLowerCase() !== authedReq.userWallet) {
      return res.status(403).json({ error: "Forbidden: Payee record does not belong to your authenticated wallet." });
    }

    await db.delete(payees).where(eq(payees.id, id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Delete payee failed" });
  }
});

// ── User Settings API Endpoints (Protected) ──────────────────────────────────
app.get("/api/user/settings/:walletAddress", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const authedReq = req as AuthedRequest;
    const wallet = req.params.walletAddress.toLowerCase();
    assertWalletScope(authedReq, wallet);

    const settings = await db.query.userSettings.findFirst({
      where: eq(userSettings.userWallet, wallet),
    });
    if (settings && settings.keeperhubApiKey) {
      const key = settings.keeperhubApiKey;
      const masked = key.length > 8 ? `${key.slice(0, 4)}...${key.slice(-4)}` : "kh_***";
      return res.json({ hasKey: true, keyMasked: masked });
    }
    res.json({ hasKey: false, keyMasked: null });
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: err instanceof Error ? err.message : "Fetch settings failed" });
  }
});

app.post("/api/user/settings", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const authedReq = req as AuthedRequest;
    const wallet = authedReq.userWallet;
    const { keeperhubApiKey } = req.body;

    if (!keeperhubApiKey) {
      return res.status(400).json({ error: "keeperhubApiKey is required" });
    }

    await db.insert(userSettings).values({
      userWallet: wallet,
      keeperhubApiKey,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: userSettings.userWallet,
      set: { keeperhubApiKey, updatedAt: new Date() },
    });

    syncKeeperHubState(wallet).catch(console.error);

    res.json({ success: true, wallet });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Save settings failed" });
  }
});

// ── DCA Schedule Endpoint (Protected) ───────────────────────────────────────
app.post("/api/dca/schedule", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const authedReq = req as AuthedRequest;
    const wallet = authedReq.userWallet;
    const { amount = 50, schedule, cronSchedule, message } = req.body;
    const result = await registerDcaWorkflow({
      userWallet: wallet,
      amount: Number(amount) || 50,
      cronSchedule: cronSchedule || schedule,
      message,
    });
    res.json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: err instanceof Error ? err.message : "DCA registration failed" });
  }
});

// ── Sync Endpoint (Protected) ────────────────────────────────────────────────
app.post("/api/keeperhub/sync", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const authedReq = req as AuthedRequest;
    const wallet = authedReq.userWallet;
    const result = await syncKeeperHubState(wallet);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Sync failed" });
  }
});

// ── Public market oracle (Chainlink — no wallet scope) ─────────────────────
app.get("/api/markets", async (_req: express.Request, res: express.Response) => {
  try {
    const snapshot = await getMarketSnapshot();
    if (snapshot.ethUsd <= 0 && snapshot.history.length === 0) {
      return res.status(503).json({ error: "Market oracle unavailable" });
    }
    res.json(snapshot);
  } catch (err) {
    res.status(503).json({
      error: err instanceof Error ? err.message : "Market oracle unavailable",
    });
  }
});

// ── Portfolio & Feed Endpoints (demo read or authenticated) ─────────────────
app.get("/api/portfolio/:walletAddress", optionalAuth, async (req: express.Request, res: express.Response) => {
  try {
    const authedReq = req as OptionalAuthedRequest;
    const walletAddress = normalizeWallet(req.params.walletAddress);
    enforceReadAccess(authedReq, walletAddress);
    const demoRead = isUnauthenticatedDemoRead(authedReq, walletAddress);

    const [position, workflows, compoundAPY] = await Promise.all([
      getAavePosition(walletAddress),
      db.query.activeWorkflows.findMany({
        where: and(
          eq(activeWorkflows.userWallet, walletAddress),
          eq(activeWorkflows.status, "active"),
        ),
      }),
      getCompoundUsdcSupplyAPY(),
    ]);

    const ctx = getWalletContext(walletAddress);
    const aaveAPY = position.currentUSDCSupplyAPY || 0;
    const apyDeltaVsAave = parseFloat((compoundAPY - aaveAPY).toFixed(2));

    const ltvPercent = position.collateralUSD > 0
      ? parseFloat(((position.debtUSD / position.collateralUSD) * 100).toFixed(1))
      : 0;

    let tempo: {
      chainId: number;
      agenticWallet: string;
      pathUsdBalance: number | null;
      explorerUrl: string;
    } | null = null;

    if (ctx?.signerWallet) {
      const pathUsdBalance = await getTempoPathUsdBalance(ctx.signerWallet);
      tempo = {
        chainId: TEMPO_CHAIN_ID,
        agenticWallet: ctx.signerWallet,
        pathUsdBalance,
        explorerUrl: tempoAddressUrl(ctx.signerWallet),
      };
    }

    res.json({
      walletAddress,
      healthFactor: position.healthFactor !== null ? parseFloat(position.healthFactor.toFixed(2)) : null,
      collateralUSD: parseFloat(position.collateralUSD.toFixed(0)),
      debtUSD: parseFloat(position.debtUSD.toFixed(0)),
      availableBorrowsUSD: parseFloat(position.availableBorrowsUSD.toFixed(0)),
      ltvPercent,
      usdcWalletBalance: parseFloat(position.usdcWalletBalance.toFixed(2)),
      usdcSuppliedUSD: parseFloat((position.usdcSuppliedUSD || 0).toFixed(2)),
      usdcSuppliedAmount: parseFloat((position.usdcSuppliedAmount || 0).toFixed(2)),
      currentUSDCSupplyAPY: parseFloat(aaveAPY.toFixed(2)),
      compoundUSDCSupplyAPY: parseFloat(compoundAPY.toFixed(2)),
      apyDeltaVsAave,
      signerWallet: ctx?.signerWallet ?? null,
      sameWallet: ctx?.sameWallet ?? false,
      yieldRotationAvailable: ctx?.canWithdrawAaveSupply ?? false,
      isError: position.isError ?? false,
      errorReason: position.errorReason,
      workflows,
      tempo,
      ...(demoRead ? { demoRead: true } : {}),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: err instanceof Error ? err.message : "Portfolio fetch failed" });
  }
});

app.post("/api/marketplace/hf-read", optionalAuth, async (req: express.Request, res: express.Response) => {
  try {
    const authedReq = req as OptionalAuthedRequest;
    let bodyWallet: string;

    if (authedReq.userWallet) {
      bodyWallet = typeof req.body?.walletAddress === "string"
        ? normalizeWallet(req.body.walletAddress)
        : authedReq.userWallet;
      enforceReadAccess(authedReq, bodyWallet);
    } else {
      bodyWallet = normalizeWallet(req.body?.walletAddress ?? "");
      if (!bodyWallet || !isDemoWallet(bodyWallet)) {
        return res.status(401).json({ error: "Unauthorized: Sign in or provide demo walletAddress" });
      }
      enforceReadAccess(authedReq, bodyWallet);
    }

    const demoRead = isUnauthenticatedDemoRead(authedReq, bodyWallet);
    const apiKey = await resolveKeeperHubApiKey(authedReq.userWallet ?? bodyWallet);
    let source: "keeperhub_marketplace" | "local_aave_read" = "keeperhub_marketplace";
    let listing402 = false;
    let raw: unknown;

    const call = await callListedWorkflow(HF_READ_SLUG, { walletAddress: bodyWallet }, apiKey);

    if (call.is402) {
      listing402 = true;
      source = "local_aave_read";
    } else if (call.isStub) {
      listing402 = false;
      source = "local_aave_read";
    } else {
      raw = call.data;
      const rawStr = JSON.stringify(raw ?? "");
      if (rawStr.includes("402") || rawStr.toLowerCase().includes("payment required")) {
        listing402 = true;
        source = "local_aave_read";
      }
    }

    let healthFactor: number | null;
    let totalCollateralUSD: number;
    let totalDebtUSD: number;

    if (source === "local_aave_read") {
      const position = await getAavePosition(bodyWallet);
      healthFactor = position.healthFactor !== null
        ? parseFloat(position.healthFactor.toFixed(2))
        : null;
      totalCollateralUSD = parseFloat(position.collateralUSD.toFixed(0));
      totalDebtUSD = parseFloat(position.debtUSD.toFixed(0));
    } else {
      const parsed = parseHfMarketplaceResult(raw);
      if (parsed.healthFactor === null) {
        const position = await getAavePosition(bodyWallet);
        healthFactor = position.healthFactor !== null
          ? parseFloat(position.healthFactor.toFixed(2))
          : null;
        totalCollateralUSD = parseFloat(position.collateralUSD.toFixed(0));
        totalDebtUSD = parseFloat(position.debtUSD.toFixed(0));
        source = "local_aave_read";
      } else {
        healthFactor = parsed.healthFactor;
        totalCollateralUSD = parsed.totalCollateralUSD ?? 0;
        totalDebtUSD = parsed.totalDebtUSD ?? 0;
      }
    }

    if (authedReq.userWallet) {
      await logExternalExecution({
        userWallet: bodyWallet,
        action: "marketplace_hf_read",
        amount: 0,
        status: "success",
        reason: listing402
          ? "HF read via local Aave fallback (marketplace x402)"
          : "HF read via KeeperHub marketplace listing",
        aiAnalysis: {
          chainId: 84532,
          source,
          listing402,
          healthFactor,
          totalCollateralUSD,
          totalDebtUSD,
          listingSlug: HF_READ_SLUG,
        },
      });
    }

    res.json({
      healthFactor,
      totalCollateralUSD,
      totalDebtUSD,
      source,
      listing402: listing402 || undefined,
      raw: source === "keeperhub_marketplace" ? raw : undefined,
      ...(demoRead ? { demoRead: true } : {}),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: err instanceof Error ? err.message : "HF read failed" });
  }
});

app.get("/api/feed/:walletAddress", optionalAuth, async (req: express.Request, res: express.Response) => {
  try {
    const authedReq = req as OptionalAuthedRequest;
    const walletAddress = normalizeWallet(req.params.walletAddress);
    enforceReadAccess(authedReq, walletAddress);
    const demoRead = isUnauthenticatedDemoRead(authedReq, walletAddress);

    const logs = await db.query.executionsLog.findMany({
      where: eq(executionsLog.userWallet, walletAddress),
      orderBy: [desc(executionsLog.timestamp)],
      limit: 200,
    });

    if (demoRead) {
      res.json({ demoRead: true, items: logs });
      return;
    }
    res.json(logs);
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    res.status(500).json({ error: err instanceof Error ? err.message : "Feed fetch failed" });
  }
});

// ── AI Chat Agent Endpoint (Protected) ───────────────────────────────────────
app.post("/api/chat", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const authedReq = req as AuthedRequest;
    const wallet = authedReq.userWallet;
    const userMessage = req.body.userMessage ?? req.body.message ?? "";
    const conversationHistory = req.body.conversationHistory ?? [];

    const apiKey = await resolveKeeperHubApiKey(wallet);
    const messages = [
      ...conversationHistory.map((m: any) => ({
        role: m.sender === "user" ? ("user" as const) : ("assistant" as const),
        content: m.text || "",
      })),
      { role: "user" as const, content: userMessage },
    ];

    const tools = createAgentTools(wallet, conversationHistory, apiKey);

    const result = await generateText({
      model: getBrainModel(),
      system: `You are NexusAgent, an intelligent, autonomous DeFi and automated payroll manager powered by KeeperHub MPC.
You talk naturally like ChatGPT or Claude. You are smart, conversational, helpful, and understand informal language, typos, slang, and complex instructions.

Your Capabilities & Tools:
1. 'schedulePayroll': Use when the user wants to set up a recurring payment, salary, or transfer to an address, team, or payee name.
2. 'scheduleDCA': Use when the user wants to set up a recurring Dollar-Cost Averaging (DCA) swap of USDC into ETH (e.g. 'dca 50 usdc into eth weekly').
3. 'cancelWorkflows': Use when the user wants to cancel, stop, or pause active workflows (payroll, dca, or all).
4. 'listWorkflows': Use when the user asks about their active workflows, registered payrolls, or DCA triggers.
5. 'listPayees': Use when the user asks about saved payees, team members, or vault pools.
6. 'queryPortfolio': Use when the user asks about their Aave position, loan, health factor, or debt.
7. 'triggerStrategy': Use when the user wants to trigger DCA, Guardian position check, or Yield Rotator immediately.
8. 'getLiveTransactions': Use when the user asks for live transactions, recent execution logs, or Sepolia Etherscan links.

Formatting Rules:
- DO NOT use markdown tables. Format lists with markdown bullet points and emojis.
- Never mention internal technical tool names to the user.`,
      messages,
      tools,
      maxSteps: 5,
    });

    const toolCalls = result.toolCalls || [];
    const toolResults = result.toolResults || [];

    res.json({
      reply: result.text,
      toolCalls,
      toolResults,
      executionResults: toolResults,
    });
  } catch (err) {
    console.error("[CHAT AGENT ERROR]", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Chat processing failed" });
  }
});

// ── Payroll & Strategy Triggers (Protected) ───────────────────────────────────
app.post("/api/payroll", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const authedReq = req as AuthedRequest;
    const wallet = authedReq.userWallet;
    const apiKey = await resolveKeeperHubApiKey(wallet);

    const result = await handlePaychain({
      ...req.body,
      walletAddress: wallet,
      apiKey,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Payroll processing failed" });
  }
});

app.post("/api/trigger/guardian", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const authedReq = req as AuthedRequest;
    const wallet = authedReq.userWallet;
    const apiKey = await resolveKeeperHubApiKey(wallet);

    await runGuardian(wallet, { apiKey });
    res.json({ triggered: true, wallet });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Guardian trigger failed" });
  }
});

app.post("/api/trigger/dca", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const authedReq = req as AuthedRequest;
    const wallet = authedReq.userWallet;
    const apiKey = await resolveKeeperHubApiKey(wallet);

    await runDCA(wallet, { apiKey });
    res.json({ triggered: true, wallet });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "DCA trigger failed" });
  }
});

app.post("/api/trigger/yield", requireAuth, async (req: express.Request, res: express.Response) => {
  try {
    const authedReq = req as AuthedRequest;
    const wallet = authedReq.userWallet;
    const apiKey = await resolveKeeperHubApiKey(wallet);

    await runYieldRotator(wallet, { apiKey });
    res.json({ triggered: true, wallet });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Yield trigger failed" });
  }
});

async function getMonitoredWallets(): Promise<string[]> {
  const [cycleRows, workflowRows, settingsRows] = await Promise.all([
    db.selectDistinct({ wallet: repaymentCycles.userWallet }).from(repaymentCycles),
    db.selectDistinct({ wallet: activeWorkflows.userWallet }).from(activeWorkflows),
    db.selectDistinct({ wallet: userSettings.userWallet }).from(userSettings),
  ]);
  const set = new Set<string>();
  cycleRows.forEach(r => r.wallet && set.add(r.wallet.toLowerCase()));
  workflowRows.forEach(r => r.wallet && set.add(r.wallet.toLowerCase()));
  settingsRows.forEach(r => r.wallet && set.add(r.wallet.toLowerCase()));
  if (set.size === 0) set.add(DEMO_WALLET.toLowerCase());
  return Array.from(set);
}

// ── Background Cron Loops ────────────────────────────────────────────────────
async function startLoops() {
  // Guardian (5 min)
  cron.schedule("*/5 * * * *", async () => {
    try {
      const wallets = await getMonitoredWallets();
      for (const wallet of wallets) {
        try {
          const apiKey = await resolveKeeperHubApiKey(wallet);
          await runGuardian(wallet, { apiKey });
        } catch (err) {
          logger.error({ wallet: wallet.slice(0, 8), err }, "[GUARDIAN CRON] Error");
          const alertKey = await resolveKeeperHubApiKey(wallet).catch(() => undefined);
          if (shouldAlert(`${wallet.slice(0, 8)}:cron_error`)) {
            sendKeeperNotification(ALERT_CHANNEL, `❌ Guardian cron failed for ${wallet.slice(0, 8)}: ${err instanceof Error ? err.message : String(err)}`, alertKey).catch(() => {});
          }
        }
      }
    } catch (err) { logger.error({ err }, "[GUARDIAN CRON] DB query failed"); }
  });

  // Yield Rotator (15 min)
  cron.schedule("*/15 * * * *", async () => {
    try {
      const wallets = await getMonitoredWallets();
      for (const wallet of wallets) {
        try {
          const apiKey = await resolveKeeperHubApiKey(wallet);
          await runYieldRotator(wallet, { apiKey });
        } catch (err) {
          logger.error({ wallet: wallet.slice(0, 8), err }, "[YIELD CRON] Error");
          const alertKey = await resolveKeeperHubApiKey(wallet).catch(() => undefined);
          if (shouldAlert(`${wallet.slice(0, 8)}:cron_error`)) {
            sendKeeperNotification(ALERT_CHANNEL, `❌ Yield cron failed for ${wallet.slice(0, 8)}: ${err instanceof Error ? err.message : String(err)}`, alertKey).catch(() => {});
          }
        }
      }
    } catch (err) { logger.error({ err }, "[YIELD CRON] DB query failed"); }
  });

  // DCA (hourly)
  cron.schedule("0 * * * *", async () => {
    try {
      const activeDcaRows = await db.query.activeWorkflows.findMany({
        where: and(eq(activeWorkflows.type, "dca"), eq(activeWorkflows.status, "active")),
      });
      for (const wf of activeDcaRows) {
        if (!shouldRunCronNow(wf.cronSchedule || "0 9 * * 1")) {
          continue; // Skip execution until scheduled window
        }
        const wallet = wf.userWallet.toLowerCase();
        try {
          const apiKey = await resolveKeeperHubApiKey(wallet);
          await runDCA(wallet, { apiKey });
        } catch (err) {
          logger.error({ wallet: wallet.slice(0, 8), err }, "[DCA CRON] Error");
          const alertKey = await resolveKeeperHubApiKey(wallet).catch(() => undefined);
          if (shouldAlert(`${wallet.slice(0, 8)}:cron_error`)) {
            sendKeeperNotification(ALERT_CHANNEL, `❌ DCA cron failed for ${wallet.slice(0, 8)}: ${err instanceof Error ? err.message : String(err)}`, alertKey).catch(() => {});
          }
        }
      }
    } catch (err) { logger.error({ err }, "[DCA CRON] DB query failed"); }
  });

  logger.info("Background cron loops initialized (Guardian: 5min, Yield: 15min, DCA: hourly).");
}

const PORT = parseInt(process.env.PORT || "3001", 10);
app.listen(PORT, () => {
  const brainInfo = getActiveBrainProvider();
  logger.info({ provider: brainInfo.provider, model: brainInfo.model }, "AI brain provider initialized");
  logger.info({ port: PORT, demoWallet: DEMO_WALLET }, "nexus-agent API started");
  startLoops();
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received — gracefully shutting down.");
  process.exit(0);
});
