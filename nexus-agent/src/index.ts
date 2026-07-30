import dotenv from "dotenv";
dotenv.config({ path: "../.env", override: true });

import express from "express";
import cors from "cors";
import cron from "node-cron";
import { verifyMessage } from "ethers";
import { generateText } from "ai";
import { githubModels, BRAIN_MODEL } from "./brain/provider.js";
import { translateIntent } from "./brain/nlu-translator.js";
import { run as runGuardian } from "./modules/guardian.js";
import { run as runYieldRotator } from "./modules/yield-rotator.js";
import { run as runDCA } from "./modules/dca.js";
import { handle as handlePaychain } from "./modules/paychain.js";
import { syncKeeperHubState } from "./lib/keeperhub-sync.js";
import { getAavePosition } from "./lib/aave.js";
import { db } from "./db/client.js";
import { activeWorkflows, executionsLog, userSettings, payees } from "./db/schema.js";
import { eq, desc, and } from "drizzle-orm";

const app = express();
app.use(cors());
app.use(express.json());

const DEMO_WALLET = (
  process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b"
).toLowerCase();

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "nexus-agent", ts: new Date().toISOString() });
});

// ── Payees Directory API Endpoints ─────────────────────────────────────────────
app.get("/api/payees/:walletAddress", async (req, res) => {
  try {
    const wallet = req.params.walletAddress.toLowerCase();
    const list = await db.query.payees.findMany({
      where: eq(payees.userWallet, wallet),
      orderBy: [desc(payees.createdAt)],
    });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Fetch payees failed" });
  }
});

app.post("/api/payees", async (req, res) => {
  try {
    const {
      userWallet,
      name,
      type, // 'single' | 'team'
      payoutMode = "direct", // 'direct' | 'vault_pool'
      vaultPoolAddress,
      members = [], // Array of { name: string, address: string }
    } = req.body;

    if (!userWallet || !name || !type) {
      return res.status(400).json({ error: "userWallet, name, and type are required" });
    }

    const wallet = userWallet.toLowerCase();

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

app.delete("/api/payees/all/:walletAddress", async (req, res) => {
  try {
    const wallet = req.params.walletAddress.toLowerCase();
    await db.delete(payees).where(eq(payees.userWallet, wallet));
    res.json({ success: true, message: `Cleared all payees for wallet ${wallet}` });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Clear payees failed" });
  }
});

app.delete("/api/payees/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await db.delete(payees).where(eq(payees.id, id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Delete payee failed" });
  }
});

// ── SIWE Authentication & Challenge ─────────────────────────────────────────
app.get("/api/auth/challenge", (req, res) => {
  const wallet = (req.query.wallet as string || DEMO_WALLET).toLowerCase();
  const timestamp = new Date().toISOString();
  const challenge = `Sign in to NexusAgent\n\nWallet: ${wallet}\nTimestamp: ${timestamp}\n\nAuthorize automated wealth management & sync KeeperHub workflows.`;
  res.json({ challenge, timestamp });
});

app.post("/api/auth/verify", async (req, res) => {
  try {
    const { walletAddress, signature, challenge } = req.body;
    if (!walletAddress || !signature || !challenge) {
      return res.status(400).json({ error: "walletAddress, signature, and challenge are required" });
    }

    const recoveredAddress = verifyMessage(challenge, signature).toLowerCase();
    const expectedAddress = walletAddress.toLowerCase();

    if (recoveredAddress !== expectedAddress) {
      return res.status(401).json({ error: "Cryptographic signature verification failed" });
    }

    const key = process.env.KEEPERHUB_API_KEY || `kh_auth_${Date.now()}`;
    await db.insert(userSettings).values({
      userWallet: expectedAddress,
      keeperhubApiKey: key,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: userSettings.userWallet,
      set: { keeperhubApiKey: key, updatedAt: new Date() },
    });

    syncKeeperHubState(expectedAddress).catch(console.error);

    res.json({
      success: true,
      walletAddress: expectedAddress,
      message: "Signature verified! KeeperHub session connected.",
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Authentication failed" });
  }
});

app.post("/api/keeperhub/sync", async (req, res) => {
  try {
    const { walletAddress = DEMO_WALLET } = req.body;
    const result = await syncKeeperHubState(walletAddress);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Sync failed" });
  }
});

app.get("/api/user/settings/:walletAddress", async (req, res) => {
  try {
    const wallet = req.params.walletAddress.toLowerCase();
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
    res.status(500).json({ error: err instanceof Error ? err.message : "Fetch settings failed" });
  }
});

app.post("/api/user/settings", async (req, res) => {
  try {
    const { walletAddress, keeperhubApiKey } = req.body;
    if (!walletAddress || !keeperhubApiKey) {
      return res.status(400).json({ error: "walletAddress and keeperhubApiKey are required" });
    }
    const wallet = walletAddress.toLowerCase();
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

app.get("/api/portfolio/:walletAddress", async (req, res) => {
  try {
    const walletAddress = req.params.walletAddress.toLowerCase();
    const [position, workflows] = await Promise.all([
      getAavePosition(walletAddress),
      db.query.activeWorkflows.findMany({
        where: eq(activeWorkflows.userWallet, walletAddress),
      }),
    ]);

    const ltvPercent = position.collateralUSD > 0
      ? parseFloat(((position.debtUSD / position.collateralUSD) * 100).toFixed(1))
      : 0;

    res.json({
      walletAddress,
      healthFactor: parseFloat(position.healthFactor.toFixed(2)),
      collateralUSD: parseFloat(position.collateralUSD.toFixed(0)),
      debtUSD: parseFloat(position.debtUSD.toFixed(0)),
      availableBorrowsUSD: parseFloat(position.availableBorrowsUSD.toFixed(0)),
      ltvPercent,
      usdcWalletBalance: parseFloat(position.usdcWalletBalance.toFixed(2)),
      currentUSDCSupplyAPY: parseFloat(position.currentUSDCSupplyAPY.toFixed(2)),
      workflows,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Portfolio fetch failed" });
  }
});

app.get("/api/feed/:walletAddress", async (req, res) => {
  try {
    const walletAddress = req.params.walletAddress.toLowerCase();
    const logs = await db.query.executionsLog.findMany({
      where: eq(executionsLog.userWallet, walletAddress),
      orderBy: [desc(executionsLog.timestamp)],
      limit: 50,
    });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Feed fetch failed" });
  }
});

import { createAgentTools } from "./brain/agent-tools.js";

app.post("/api/chat", async (req, res) => {
  try {
    const { userMessage, conversationHistory = [], walletAddress = DEMO_WALLET } = req.body;
    const wallet = walletAddress.toLowerCase();

    // Format conversation history for AI SDK generateText
    const messages = [
      ...conversationHistory.map((m: any) => ({
        role: m.sender === "user" ? ("user" as const) : ("assistant" as const),
        content: m.text || "",
      })),
      { role: "user" as const, content: userMessage },
    ];

    // Instantiate native tools for this user wallet
    const tools = createAgentTools(wallet, conversationHistory);

    // Call GPT-4o / Claude with Native Tool Calling (Agent Loop)
    const result = await generateText({
      model: githubModels(BRAIN_MODEL),
      system: `You are NexusAgent, an intelligent, autonomous DeFi and automated payroll manager powered by KeeperHub MPC.
You talk naturally like ChatGPT or Claude. You are smart, conversational, helpful, and understand informal language, typos, slang, and complex instructions.

Your Capabilities & Tools:
1. 'schedulePayroll': Use when the user wants to set up a recurring payment, salary, or transfer to an address, team, or payee name (e.g. 'pay 0x123... 10 USDC every friday', 'send 50 bucks to dev team weekly'). If user says 'do it anyway', 'confirm', 'override', set isExplicitOverride: true.
2. 'cancelPayrolls': Use when the user wants to cancel, stop, or pause active payrolls or workflows (e.g. 'stop all payrolls', 'cancle all', 'pause my payments').
3. 'listWorkflows': Use when the user asks about their active workflows, registered payrolls, or triggers (e.g. 'what are my workflows', 'my workflow', 'active payments').
4. 'listPayees': Use when the user asks about saved payees, team members, or vault pools (e.g. 'show my payees', 'who are my team members').
5. 'queryPortfolio': Use when the user asks about their Aave position, loan, health factor, or debt.
6. 'triggerStrategy': Use when the user wants to trigger DCA, Guardian position check, or Yield Rotator immediately.
7. 'getLiveTransactions': Use when the user asks for live transactions, recent execution logs, or Sepolia Etherscan links (e.g. 'show live tx', 'recent transactions', 'etherscan links').

Formatting Rules:
- DO NOT use markdown tables (e.g. '| col | col |'). Chat bubbles wrap tables poorly.
- Always format lists (active workflows, payees, history) as clean, numbered or bulleted markdown lists with emojis (e.g. '1. 🟢 **PAYROLL** — 20 USDC (Every Thursday) → 0x1234...').
- If no tool is needed (e.g. greetings, general DeFi questions), answer naturally in conversational English.
- Never mention internal technical tool names to the user.`,
      messages,
      tools,
      maxSteps: 5, // Allows autonomous Tool Call -> Execution -> Final Natural Language Response
    });

    // Extract tool calls and execution results for audit feed
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

app.post("/api/payroll", async (req, res) => {
  try {
    const result = await handlePaychain(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Payroll processing failed" });
  }
});

app.post("/api/trigger/guardian", async (req, res) => {
  const wallet = (req.body.wallet || DEMO_WALLET).toLowerCase();
  runGuardian(wallet)
    .then(() => res.json({ triggered: true, wallet }))
    .catch(err => res.status(500).json({ error: err.message }));
});

app.post("/api/trigger/dca", async (req, res) => {
  const wallet = (req.body.wallet || DEMO_WALLET).toLowerCase();
  runDCA(wallet)
    .then(() => res.json({ triggered: true, wallet }))
    .catch(err => res.status(500).json({ error: err.message }));
});

app.post("/api/trigger/yield", async (req, res) => {
  const wallet = (req.body.wallet || DEMO_WALLET).toLowerCase();
  runYieldRotator(wallet)
    .then(() => res.json({ triggered: true, wallet }))
    .catch(err => res.status(500).json({ error: err.message }));
});

function startLoops() {
  cron.schedule("*/5 * * * *", () => {
    runGuardian(DEMO_WALLET).catch(err => console.error("[GUARDIAN CRON ERROR]:", err));
  });

  cron.schedule("*/15 * * * *", () => {
    runYieldRotator(DEMO_WALLET).catch(err => console.error("[YIELD CRON ERROR]:", err));
  });

  cron.schedule("0 * * * *", () => {
    runDCA(DEMO_WALLET).catch(err => console.error("[DCA CRON ERROR]:", err));
  });

  console.log("[NEXUS] Background cron loops initialized (Guardian: 5min, Yield: 15min, DCA: hourly).");
}

const PORT = parseInt(process.env.PORT || "3001", 10);
app.listen(PORT, () => {
  console.log(`[NEXUS] nexus-agent API running on http://localhost:${PORT}`);
  console.log(`[NEXUS] Demo wallet: ${DEMO_WALLET}`);
  startLoops();
});

process.on("SIGTERM", () => {
  console.log("[NEXUS] SIGTERM received — gracefully shutting down.");
  process.exit(0);
});
