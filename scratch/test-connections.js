import dotenv from 'dotenv';
import pg from 'pg';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { JsonRpcProvider } from 'ethers';

// Load .env from workspace parent
dotenv.config({ path: '../.env' });

async function runTest() {
  console.log("🔍 Starting connection diagnostics...\n");

  // 1. Database Connection Test
  const dbUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("❌ DATABASE_URL or DATABASE_PUBLIC_URL is missing in .env");
  } else {
    console.log(`📡 Testing Database connection to: ${dbUrl.split('@')[1] || dbUrl}...`);
    const pool = new pg.Pool({ connectionString: dbUrl });
    try {
      const res = await pool.query('SELECT NOW()');
      console.log(`✅ Database connection successful! Server time: ${res.rows[0].now}`);
    } catch (err) {
      console.error(`❌ Database connection failed: ${err.message}`);
    } finally {
      await pool.end();
    }
  }

  console.log("\n--------------------------------------------------\n");

  // 2. AI Brain Connection Test
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    console.error("❌ GITHUB_TOKEN is missing in .env");
  } else {
    console.log("📡 Testing GitHub Models API connection...");
    try {
      const githubModels = createOpenAI({
        baseURL: 'https://models.inference.ai.azure.com',
        apiKey: githubToken,
      });

      const { text } = await generateText({
        model: githubModels('meta-llama-3.3-70b-instruct'),
        prompt: 'Respond with the word "Connected" and nothing else.',
      });

      console.log(`✅ AI connection successful! Model output: "${text.trim()}"`);
    } catch (err) {
      console.error(`❌ AI connection failed: ${err.message}`);
    }
  }

  console.log("\n--------------------------------------------------\n");

  // 3. RPC Provider Connections Test
  const rpcs = [
    { name: 'Alchemy', url: process.env.ALCHEMY_RPC_URL },
    { name: 'Infura', url: process.env.INFURA_RPC_URL }
  ];

  for (const rpc of rpcs) {
    if (!rpc.url) {
      console.error(`❌ ${rpc.name} URL is missing in .env`);
      continue;
    }
    console.log(`📡 Testing ${rpc.name} RPC node: ${rpc.url.substring(0, 45)}...`);
    try {
      const provider = new JsonRpcProvider(rpc.url);
      const blockNum = await provider.getBlockNumber();
      console.log(`✅ ${rpc.name} connection successful! Current Sepolia block: ${blockNum}`);
    } catch (err) {
      console.error(`❌ ${rpc.name} connection failed: ${err.message}`);
    }
  }

  console.log("\nDiagnostics finished.");
}

runTest();
