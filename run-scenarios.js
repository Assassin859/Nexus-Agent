const fs = require('fs');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const API_URL = 'https://models.inference.ai.azure.com/chat/completions';
const MODEL_NAME = 'Llama-3.3-70B-Instruct';

// Helper to strip markdown block syntax if present
function parseCleanJson(text) {
  let cleanText = text.trim();
  if (cleanText.startsWith('```')) {
    // Remove leading ```json or ``` and trailing ```
    cleanText = cleanText.replace(/^```[a-zA-Z0-9]*\n/, '').replace(/\n```$/, '').trim();
  }
  return JSON.parse(cleanText);
}

// ---------------------------------------------------------
// Define Scenarios to Test (Normal & Volatile Markets)
// ---------------------------------------------------------
const scenarios = [
  {
    name: 'Guardian: Critical Liquidation Risk (Should Repay)',
    system: `You are the NexusAgent Guardian Brain. Analyze Aave V3 lending positions and output valid JSON only. Schema: {"action": "repay" | "supply_collateral" | "hold", "urgency": "critical" | "warning" | "safe", "amount": number, "asset": string, "reason": string}. CRITICAL: Do NOT wrap the output in markdown code blocks like \`\`\`json. Output ONLY raw valid JSON.`,
    prompt: `Current Aave V3 position:
- Collateral: 1.0 ETH ($2,500 USD) at 82.5% Liquidation Threshold
- Debt: 2,000 USDC
- Current Health Factor: 1.03 (Very close to liquidation!)
- Wallet USDC balance: 500 USDC
- Wallet ETH balance: 0.1 ETH
Select the best action to save the position from immediate liquidation. Output JSON only.`
  },
  {
    name: 'Guardian: Normal Stable Market (Should Hold)',
    system: `You are the NexusAgent Guardian Brain. Analyze Aave V3 lending positions and output valid JSON only. Schema: {"action": "repay" | "supply_collateral" | "hold", "urgency": "critical" | "warning" | "safe", "amount": number, "asset": string, "reason": string}. CRITICAL: Do NOT wrap the output in markdown code blocks like \`\`\`json. Output ONLY raw valid JSON.`,
    prompt: `Current Aave V3 position:
- Collateral: 2.0 ETH ($5,000 USD)
- Debt: 2,200 USDC
- Current Health Factor: 1.87
- ETH price trend: Stable (+0.2% in last 4 hours)
- Wallet USDC balance: 1,500 USDC
- Wallet ETH balance: 0.5 ETH
Select the best action. Output JSON only.`
  },
  {
    name: 'Guardian: Volatile Market Flash Crash (Should Proactively Repay)',
    system: `You are the NexusAgent Guardian Brain. Analyze Aave V3 lending positions and output valid JSON only. Schema: {"action": "repay" | "supply_collateral" | "hold", "urgency": "critical" | "warning" | "safe", "amount": number, "asset": string, "reason": string}. CRITICAL: Do NOT wrap the output in markdown code blocks like \`\`\`json. Output ONLY raw valid JSON.`,
    prompt: `Current Aave V3 position:
- Collateral: 1.5 ETH ($3,750 USD)
- Debt: 2,400 USDC
- Current Health Factor: 1.28
- ETH price trend: Volatile Crash (-12% in the last 45 minutes, heavy selling pressure)
- Wallet USDC balance: 1,000 USDC
- Wallet ETH balance: 0.2 ETH
Should we intervene early to protect against the crash, or hold? Output JSON only.`
  },
  {
    name: 'Yield: High APY Delta but Volatile Gas Congestion (Should Hold)',
    system: `You are the NexusAgent Yield Rotator Brain. Optimize stablecoin yields. Net profit check: (Amount * APY_Delta) - Gas_Fees > 0. Response schema: {"should_rotate": boolean, "from_protocol": string, "to_protocol": string, "asset": string, "amount": number, "estimated_apy_gain_usd": number, "reason": string}. CRITICAL: Do NOT wrap the output in markdown code blocks like \`\`\`json. Output ONLY raw valid JSON.`,
    prompt: `Current Portfolio:
- Capital: 10,000 USDC deposited in Aave V3 earning 3.0% APY.
- Market Rates: Compound V3 APY has spiked to 6.5% APY on USDC.
- Network Conditions: Heavy network volatility; execution gas fees are currently spiked at $380 USD due to gas war.
Calculate the net gain/loss over a 30-day window and decide if we rotate. Output JSON only.`
  },
  {
    name: 'Yield: Stable Market Small Delta with Large Capital (Should Rotate)',
    system: `You are the NexusAgent Yield Rotator Brain. Optimize stablecoin yields. Net profit check: (Amount * APY_Delta) - Gas_Fees > 0. Response schema: {"should_rotate": boolean, "from_protocol": string, "to_protocol": string, "asset": string, "amount": number, "estimated_apy_gain_usd": number, "reason": string}. CRITICAL: Do NOT wrap the output in markdown code blocks like \`\`\`json. Output ONLY raw valid JSON.`,
    prompt: `Current Portfolio:
- Capital: 250,000 USDC deposited in Aave V3 earning 3.2% APY.
- Market Rates: Compound V3 is offering 4.0% APY on USDC (0.8% delta).
- Network Conditions: Quiet stable market; execution gas fees are $65 USD.
Decide if we rotate. Output JSON only.`
  },
  {
    name: 'DCA: Volatile Gas Spikes during scheduled time (Should Delay)',
    system: `You are the NexusAgent DCA Brain. Manage automated token swaps. If gas fees > 5% of purchase value, set execute_swap to false and suggest a delay. Schema: {"execute_swap": boolean, "source_asset": string, "target_asset": string, "amount_in_usd": number, "delay_minutes": number, "reason": string}. CRITICAL: Do NOT wrap the output in markdown code blocks like \`\`\`json. Output ONLY raw valid JSON.`,
    prompt: `Scheduled DCA Execution:
- Strategy: Swap 100 USDC for WETH weekly.
- Current network gas fee estimate: $8.50 USD.
Should we execute the swap now or delay? Output JSON only.`
  },
  {
    name: 'DCA: Calm Market Normal Gas (Should Swap)',
    system: `You are the NexusAgent DCA Brain. Manage automated token swaps. If gas fees > 5% of purchase value, set execute_swap to false and suggest a delay. Schema: {"execute_swap": boolean, "source_asset": string, "target_asset": string, "amount_in_usd": number, "delay_minutes": number, "reason": string}. CRITICAL: Do NOT wrap the output in markdown code blocks like \`\`\`json. Output ONLY raw valid JSON.`,
    prompt: `Scheduled DCA Execution:
- Strategy: Swap 200 USDC for WETH weekly.
- Current network gas fee estimate: $2.10 USD.
Should we execute the swap now or delay? Output JSON only.`
  },
  {
    name: 'PayChain: Payroll exceeding Safety Threshold (Should Require Verification)',
    system: `You are the NexusAgent PayChain Brain. Parse natural language into structured cron-based payroll settings. Schema: {"recipient_address": string, "recipient_name": string, "amount": number, "token": "USDC"|"USDT"|"WETH", "frequency": "weekly"|"biweekly"|"monthly"|"one_time", "cron_schedule": string, "verification_required": boolean}. CRITICAL: Do NOT wrap the output in markdown code blocks like \`\`\`json. Output ONLY raw valid JSON.`,
    prompt: `Instruction: "Transfer 5,500 USDC to address 0x90F8bf6A479f320ced073E1B302941E17867B302 on the 1st of every month at midnight." Payout safety limit is 1,000 USDC. Output JSON only.`
  }
];

// ---------------------------------------------------------
// API Request Helper
// ---------------------------------------------------------
async function runQuery(system, prompt) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GITHUB_TOKEN}`
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt }
      ],
      model: MODEL_NAME,
      temperature: 0.1,
      max_tokens: 300
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  const json = await response.json();
  return json.choices[0].message.content.trim();
}

// ---------------------------------------------------------
// Main Test Loop
// ---------------------------------------------------------
async function main() {
  console.log(`🚀 Starting NexusAgent Scenario Test Runner`);
  console.log(`Using Model: ${MODEL_NAME}`);
  console.log(`---------------------------------------------------------\n`);

  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i];
    console.log(`[Scenario ${i + 1}/${scenarios.length}]: ${s.name}`);
    console.log(`Thinking...`);

    try {
      const decision = await runQuery(s.system, s.prompt);
      console.log(`\nResponse JSON:`);
      console.log(decision);
      
      // Attempt validation check and parsing
      const parsed = parseCleanJson(decision);
      console.log(`\n✅ Valid JSON Parsed successfully.`);
    } catch (err) {
      console.log(`\n❌ Failed: ${err.message}`);
    }
    console.log(`\n---------------------------------------------------------\n`);
  }
}

main();
