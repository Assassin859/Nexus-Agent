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

app.post("/api/chat", async (req, res) => {
  try {
    const { userMessage, conversationHistory = [], walletAddress = DEMO_WALLET } = req.body;
    const wallet = walletAddress.toLowerCase();

    // ── Stage 1: NLU Translation ─────────────────────────────────────────────
    // Convert raw user input → clean canonical action + normalizedPrompt.
    // No keyword shortcuts. The LLM handles everything.
    const nlu = await translateIntent(userMessage, conversationHistory, wallet);

    console.log(`[NLU] action=${nlu.action} confidence=${nlu.confidence.toFixed(2)} prompt="${nlu.normalizedPrompt}"`);

    // If NLU is uncertain, ask for clarification
    if (nlu.requiresClarification && nlu.clarificationQuestion) {
      return res.json({
        reply: `🤔 ${nlu.clarificationQuestion}`,
        nlu,
        executionResults: [],
      });
    }

    // ── Stage 2: Execution Router ─────────────────────────────────────────────
    // Route purely on nlu.action — pass normalizedPrompt to all executors.
    const fullTranscript = conversationHistory
      .map((m: any) => `${m.sender === "user" ? "User" : "Agent"}: ${m.text}`)
      .join("\n") + `\nUser: ${userMessage}`;

    let reply = "";
    let executionResults: any[] = [];

    switch (nlu.action) {

      // ── Payroll Scheduling ──────────────────────────────────────────────────
      case "schedule_payroll": {
        const payRes = await handlePaychain({
          userMessage: nlu.normalizedPrompt,
          conversationHistory,
          walletAddress: wallet,
        });
        reply = payRes.message;
        executionResults.push({ type: "payroll", result: payRes });
        break;
      }

      // ── Confirmation / Override ─────────────────────────────────────────────
      case "confirm_action": {
        const payRes = await handlePaychain({
          userMessage: nlu.parameters.isOverride
            ? `OVERRIDE_CONFIRMED: ${fullTranscript}`
            : fullTranscript,
          conversationHistory,
          walletAddress: wallet,
        });
        reply = payRes.message;
        executionResults.push({ type: "confirmation", result: payRes });
        break;
      }

      // ── Cancel All Payrolls ─────────────────────────────────────────────────
      case "cancel_payroll": {
        const cancelled = await db.update(activeWorkflows)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(and(
            eq(activeWorkflows.userWallet, wallet),
            eq(activeWorkflows.type, "payroll")
          ))
          .returning();

        await db.insert(executionsLog).values({
          userWallet: wallet,
          action: "payroll",
          amount: 0,
          status: "success",
          reason: `Cancelled all active payroll workflows. NLU: "${nlu.normalizedPrompt}"`,
        });

        reply = cancelled.length > 0
          ? `🛑 **Cancelled ${cancelled.length} active payroll workflow(s).** No further scheduled payouts will execute.`
          : "ℹ️ No active payroll workflows found to cancel.";
        executionResults.push({ type: "cancel_payroll", cancelled: cancelled.length });
        break;
      }

      // ── List Payees ─────────────────────────────────────────────────────────
      case "list_payees": {
        const userPayees = await db.query.payees.findMany({
          where: eq(payees.userWallet, wallet),
          orderBy: [desc(payees.createdAt)],
        });

        if (userPayees.length === 0) {
          reply = "👥 You have no payees registered yet. Visit the **Payees page** to add recipients or team vault pools.";
        } else {
          const payeeList = userPayees.map((p, idx) => {
            const badge = p.type === "team"
              ? `👥 Team (${p.payoutMode === "vault_pool" ? "Vault Pool" : "Direct"})`
              : "👤 Single";
            return `${idx + 1}. **${p.name}** — ${badge}`;
          }).join("\n");
          reply = `👥 **Registered Payees (${userPayees.length}):**\n\n${payeeList}`;
        }
        executionResults.push({ type: "list_payees", count: userPayees.length });
        break;
      }

      // ── List Active Workflows ───────────────────────────────────────────────
      case "list_workflows": {
        const activeWfs = await db.query.activeWorkflows.findMany({
          where: eq(activeWorkflows.userWallet, wallet),
          orderBy: [desc(activeWorkflows.createdAt)],
        });

        if (activeWfs.length === 0) {
          reply = "📊 You have no active workflows or payroll schedules registered.";
        } else {
          const wfSummaries = activeWfs.map((w, idx) => {
            const recip = w.recipientAddress ? `→ ${w.recipientAddress.slice(0, 10)}...` : "";
            const statusBadge = w.status === "active" ? "🟢" : "🔴";
            return `${idx + 1}. ${statusBadge} ${w.type.toUpperCase()} — **${w.amount} USDC** (${w.cronSchedule || "Manual"}) ${recip}`;
          }).join("\n");
          reply = `📊 **Active Workflows Registry (${activeWfs.length}):**\n\n${wfSummaries}`;
        }
        executionResults.push({ type: "list_workflows", count: activeWfs.length });
        break;
      }

      // ── Query Portfolio (Aave) ──────────────────────────────────────────────
      case "query_portfolio": {
        const pos = await getAavePosition(wallet);
        reply = `📊 **Portfolio Status:**\n\n• Health Factor: **${pos.healthFactor.toFixed(2)}** ${pos.healthFactor < 1.2 ? "⚠️ Low!" : "✅ Safe"}\n• Collateral: **$${pos.collateralUSD.toFixed(0)}**\n• Debt: **$${pos.debtUSD.toFixed(0)}**`;
        executionResults.push({ type: "query_portfolio", healthFactor: pos.healthFactor });
        break;
      }

      // ── DCA Strategy ───────────────────────────────────────────────────────
      case "trigger_dca": {
        await runDCA(wallet);
        reply = "🤖 **DCA Strategy Triggered!** Uniswap V3 swap calldata has been prepared and submitted.";
        executionResults.push({ type: "dca", status: "success" });
        break;
      }

      // ── Guardian Check ──────────────────────────────────────────────────────
      case "trigger_guardian": {
        await runGuardian(wallet);
        reply = "🛡️ **Guardian Position Check Triggered!** Evaluated Health Factor and repayment safety.";
        executionResults.push({ type: "guardian", status: "success" });
        break;
      }

      // ── Yield Rotator ───────────────────────────────────────────────────────
      case "trigger_yield_rotate": {
        await runYieldRotator(wallet);
        reply = "🤖 **Yield Rotator Triggered!** APY delta evaluated and execution feed updated.";
        executionResults.push({ type: "yield_rotate", status: "success" });
        break;
      }

      // ── Unknown / Generic ───────────────────────────────────────────────────
      case "unknown":
      default: {
        const { text } = await generateText({
          model: githubModels(BRAIN_MODEL),
          system: "You are NexusAgent, an autonomous DeFi wealth management assistant. Be concise and helpful. Guide users towards actionable commands: scheduling payrolls, checking portfolios, running DCA/yield strategies.",
          prompt: `User said: "${userMessage}"\n\nConversation context:\n${fullTranscript}`,
        });
        reply = text;
        executionResults.push({ type: "unknown" });
        break;
      }
    }

    res.json({
      reply,
      nlu: { action: nlu.action, confidence: nlu.confidence, normalizedPrompt: nlu.normalizedPrompt },
      executionResults,
    });
  } catch (err) {
    console.error("[CHAT ERROR]", err);
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
