/**
 * sign-and-chat.ts
 * Signs a SIWE challenge with the local private key, gets a JWT,
 * then fires multiple chat commands to register distinct workflows on KeeperHub.
 */
import "../lib/env.js";
import { ethers } from "ethers";
import { DEMO_MONITORED_WALLET, DEMO_PAYROLL_RECIPIENTS } from "../lib/demo-addresses.js";

const BASE = process.env.AGENT_URL || "https://nexus-agent-production-7783.up.railway.app";
const WALLET = (process.env.NEXT_PUBLIC_WALLET_ADDRESS || DEMO_MONITORED_WALLET).toLowerCase();
const PK = process.env.AGENTIC_WALLET_KEY || process.env.PRIVATE_KEY || "";

if (!PK) {
  console.error("❌ No private key found. Set AGENTIC_WALLET_KEY or PRIVATE_KEY in .env");
  process.exit(1);
}

const CHAT_COMMANDS = [
  "schedule DCA of 20 USDC into ETH every Monday",
  "schedule DCA of 75 USDC into ETH every 1st of the month",
  `set up weekly payroll of ${DEMO_PAYROLL_RECIPIENTS[0].amount} USDC to ${DEMO_PAYROLL_RECIPIENTS[0].address} every Friday`,
  "schedule DCA of 200 USDC into ETH every Wednesday at 10am",
  `pay ${DEMO_PAYROLL_RECIPIENTS[1].address} ${DEMO_PAYROLL_RECIPIENTS[1].amount} USDC monthly`,
];

async function fetchJson(url: string, opts?: RequestInit) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function main() {
  console.log("=================================================");
  console.log("💬 CHAT-BASED MULTI-WORKFLOW TRIGGER");
  console.log(`📍 Agent: ${BASE}`);
  console.log(`📍 Wallet: ${WALLET}`);
  console.log("=================================================\n");

  // 1. Get challenge
  console.log("🔑 Step 1: SIWE Challenge...");
  const { challenge } = await fetchJson(`${BASE}/api/auth/challenge?wallet=${WALLET}`);
  
  // 2. Sign with local private key
  const signer = new ethers.Wallet(PK);
  const signerAddr = (await signer.getAddress()).toLowerCase();
  console.log(`   Signer address: ${signerAddr}`);
  
  if (signerAddr !== WALLET) {
    console.warn(`   ⚠️  Signer (${signerAddr}) != wallet (${WALLET}). Using signer address for auth.`);
  }
  
  // Re-get challenge for the signer wallet if different
  const { challenge: signedChallenge } = signerAddr !== WALLET
    ? await fetchJson(`${BASE}/api/auth/challenge?wallet=${signerAddr}`)
    : { challenge };

  const signature = await signer.signMessage(signedChallenge);
  
  // 3. Verify and get JWT
  console.log("   Verifying signature...");
  const authResult = await fetchJson(`${BASE}/api/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: signerAddr, signature, challenge: signedChallenge }),
  });
  
  const token = authResult.token;
  console.log(`✅ JWT obtained (expires: ${authResult.expiresIn})\n`);

  // 4. Fire each chat command
  console.log("📌 Step 2: Firing workflow commands via AI Chat\n");
  
  const conversationHistory: Array<{ sender: string; text: string }> = [];
  
  for (let i = 0; i < CHAT_COMMANDS.length; i++) {
    const cmd = CHAT_COMMANDS[i];
    console.log(`  [${i + 1}/${CHAT_COMMANDS.length}] "${cmd}"`);
    
    try {
      const result = await fetchJson(`${BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userMessage: cmd, conversationHistory }),
      });
      
      const reply = result.reply || "";
      const toolResults = result.toolResults || result.executionResults || [];
      
      // Extract any workflowIds from tool results
      const wfIds: string[] = [];
      for (const tr of toolResults) {
        const res = tr.result as any;
        if (res?.workflowId && !String(res.workflowId).includes("stub")) {
          wfIds.push(res.workflowId);
        }
      }
      
      if (wfIds.length > 0) {
        console.log(`     ✅ workflowId(s): ${wfIds.join(", ")}`);
        for (const id of wfIds) {
          console.log(`     🔗 https://app.keeperhub.com/workflows/${id}`);
        }
      } else {
        // Print first 120 chars of reply
        console.log(`     💬 ${reply.slice(0, 120).replace(/\n/g, " ")}${reply.length > 120 ? "..." : ""}`);
      }
      
      // Add to conversation history
      conversationHistory.push({ sender: "user", text: cmd });
      conversationHistory.push({ sender: "agent", text: reply });
      
    } catch (err) {
      console.log(`     ❌ ${err instanceof Error ? err.message : String(err)}`);
    }
    
    // Wait 2s between calls to avoid rate limiting
    await new Promise(r => setTimeout(r, 2000));
  }
  
  console.log("\n=================================================");
  console.log("✅ All chat commands fired!");
  console.log("👉 Open http://localhost:3000/feed to see the workflows in the dashboard");
  console.log("👉 Or visit https://app.keeperhub.com/workflows to see them on KeeperHub");
  console.log("=================================================");
  process.exit(0);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
