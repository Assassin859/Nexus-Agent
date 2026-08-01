import "../lib/env.js";
import { generateText, generateObject } from "ai";
import { z } from "zod";
import { getBrainModel, getActiveBrainProvider } from "../brain/provider.js";

async function main() {
  const providerInfo = getActiveBrainProvider();
  console.log(`🤖 Testing AI Brain Provider: ${providerInfo.provider} (${providerInfo.model})\n`);

  try {
    console.log("1️⃣ Testing generateText (Chat Simulation)...");
    const textRes = await generateText({
      model: getBrainModel(),
      prompt: "Reply with exactly: OK",
    });
    console.log(`   -> Response: ${textRes.text.trim()}`);

    console.log("\n2️⃣ Testing generateObject + Zod (Guardian / PayChain Simulation)...");
    const objectRes = await generateObject({
      model: getBrainModel(),
      schema: z.object({
        action: z.enum(["hold", "repay"]),
        reason: z.string(),
      }),
      prompt: '{"healthFactor": 3.28, "walletBalance": 100, "instruction": "Choose either hold or repay"}',
    });
    console.log(`   -> Response: ${JSON.stringify(objectRes.object)}`);

    console.log("\n✅ SMOKE TEST PASSED: Gemini provider is fully operational!");
  } catch (err) {
    console.error("\n❌ SMOKE TEST FAILED:", err);
    process.exit(1);
  }
}

main();
