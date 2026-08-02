/**
 * Smoke Tier 2 dashboard surfaces on production (or AGENT_URL).
 * Usage: AGENT_URL=https://... pnpm exec tsx src/scripts/smoke-tier2-dashboard.ts
 */
import "../lib/env.js";
import { generateAuthToken } from "../middleware/auth.js";

const wallet = (
  process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b"
).toLowerCase();
const agent = process.env.AGENT_URL || "http://localhost:3001";
const dash =
  process.env.DASHBOARD_URL || "https://spirited-heart-production-b5c5.up.railway.app";

const headers = {
  Authorization: `Bearer ${generateAuthToken(wallet)}`,
  "Content-Type": "application/json",
};

let failed = 0;
function ok(label: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`);
  else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

console.log("\n=== Tier 2 Dashboard Smoke ===");
console.log(`Agent:     ${agent}`);
console.log(`Dashboard: ${dash}`);
console.log(`Wallet:    ${wallet}\n`);

const health = await fetch(`${agent}/health`).then((r) => r.json());
ok("Agent health", health.status === "ok");

const pf = await fetch(`${agent}/api/portfolio/${wallet}`, { headers }).then((r) => r.json());
ok("Portfolio HF", typeof pf.healthFactor === "number" && pf.healthFactor > 0, `HF=${pf.healthFactor}`);
ok("Portfolio tempo block", pf.tempo?.chainId === 42431, `balance=${pf.tempo?.pathUsdBalance}`);

const hf = await fetch(`${agent}/api/marketplace/hf-read`, {
  method: "POST",
  headers,
  body: JSON.stringify({ walletAddress: wallet }),
}).then((r) => r.json());
ok("HF-read API", hf.healthFactor != null, `source=${hf.source} listing402=${hf.listing402 ?? false}`);

const dashPfRes = await fetch(`${dash}/api/portfolio/${wallet}`, { headers });
const dashPf = await dashPfRes.json();
ok("Dashboard portfolio proxy", dashPfRes.ok && dashPf.tempo?.agenticWallet, `status=${dashPfRes.status}`);

const dashHfRes = await fetch(`${dash}/api/marketplace/hf-read`, {
  method: "POST",
  headers,
  body: JSON.stringify({ walletAddress: wallet }),
});
const dashHf = await dashHfRes.json();
ok("Dashboard HF-read proxy", dashHfRes.ok && dashHf.healthFactor != null, `status=${dashHfRes.status}`);

const feed = await fetch(`${agent}/api/feed/${wallet}`, { headers }).then((r) => r.json());
const tempoRows = (Array.isArray(feed) ? feed : []).filter((r) => r.action === "tempo_transfer");
ok("Feed tempo_transfer rows", tempoRows.length >= 1, `count=${tempoRows.length}`);

console.log(`\n${failed === 0 ? "All checks passed." : `${failed} check(s) failed.`}\n`);
process.exit(failed > 0 ? 1 : 0);
