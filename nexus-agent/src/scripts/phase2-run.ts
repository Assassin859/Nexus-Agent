import "../lib/env.js";
import { generateAuthToken } from "../middleware/auth.js";

async function main() {
  const wallet = "0x89f97cb35236a1d0190fb25b31c5c0ff4107ec1b";
  const agentUrl = process.env.AGENT_URL || "http://localhost:3001";
  const token = generateAuthToken(wallet);
  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  console.log("=================================================");
  console.log("🚀 STARTING PHASE 2 MODULE EXECUTION TESTS");
  console.log("=================================================\n");

  let allPassed = true;

  // 1. Guardian Evaluation
  console.log("--- 1. Guardian Liquidation Protection ---");
  const guardRes = await fetch(`${agentUrl}/api/trigger/guardian`, {
    method: "POST",
    headers: authHeaders,
  });
  const guardData = await guardRes.json();
  if (!guardRes.ok) {
    console.error("❌ Guardian Trigger Failed:", guardRes.status, guardData);
    allPassed = false;
  } else {
    console.log("✅ Guardian Trigger Result:", guardData);
  }

  // 2. Yield Rotator Evaluation
  console.log("\n--- 2. Yield Rotator ---");
  const yieldRes = await fetch(`${agentUrl}/api/trigger/yield`, {
    method: "POST",
    headers: authHeaders,
  });
  const yieldData = await yieldRes.json();
  if (!yieldRes.ok) {
    console.error("❌ Yield Rotator Trigger Failed:", yieldRes.status, yieldData);
    allPassed = false;
  } else {
    console.log("✅ Yield Rotator Trigger Result:", yieldData);
  }

  // 3. DCA Schedule & Trigger
  console.log("\n--- 3. DCA Engine ---");
  const dcaSchedRes = await fetch(`${agentUrl}/api/dca/schedule`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ amount: 10, message: "every Friday" }),
  });
  const dcaSchedData = await dcaSchedRes.json();
  if (!dcaSchedRes.ok || dcaSchedData.success !== true) {
    console.error("❌ DCA Schedule Failed:", dcaSchedRes.status, dcaSchedData);
    allPassed = false;
  } else {
    console.log("✅ DCA Schedule Result:", dcaSchedData);
  }

  const dcaTrigRes = await fetch(`${agentUrl}/api/trigger/dca`, {
    method: "POST",
    headers: authHeaders,
  });
  const dcaTrigData = await dcaTrigRes.json();
  if (!dcaTrigRes.ok) {
    console.error("❌ DCA Trigger Failed:", dcaTrigRes.status, dcaTrigData);
    allPassed = false;
  } else {
    console.log("✅ DCA Trigger Result:", dcaTrigData);
  }

  // 4. PayChain Payroll (with conversationHistory context)
  console.log("\n--- 4. PayChain Payroll ---");
  const recipientAddr = `0x22222222222222222222222222222222${Math.floor(Math.random() * 100000000).toString(16).padStart(8, '0')}`;
  const initialPrompt = `Pay 25 USDC to ${recipientAddr} every Friday`;
  const payRes1 = await fetch(`${agentUrl}/api/payroll`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ userMessage: initialPrompt }),
  });
  const payData1 = await payRes1.json();

  let payDataFinal = payData1;
  let payResFinal = payRes1;

  if (payRes1.ok && payData1.verification_required) {
    console.log("ℹ️ PayChain requested verification — sending confirmation with conversation history...");
    payResFinal = await fetch(`${agentUrl}/api/payroll`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        userMessage: "confirm",
        conversationHistory: [
          { sender: "user", text: initialPrompt },
          { sender: "agent", text: payData1.message },
        ],
      }),
    });
    payDataFinal = await payResFinal.json();
  }

  if (!payResFinal.ok || (!payDataFinal.success && !payDataFinal.message?.includes("stub mode"))) {
    console.error("❌ PayChain Failed:", payResFinal.status, payDataFinal);
    allPassed = false;
  } else {
    console.log("✅ PayChain Result:", payDataFinal);
  }

  console.log("\n=================================================");
  console.log(allPassed ? "🎉 SCRIPT SURFACES PASSED!" : "⚠️ SOME SCRIPT SURFACES FAILED");
  console.log("📌 Verify Guardian hold and Yield skip in check-logs output.");
  console.log("=================================================");

  if (!allPassed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
