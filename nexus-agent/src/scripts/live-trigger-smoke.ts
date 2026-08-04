/**
 * Fast production trigger smoke — guardian/dca/yield + mined feed count.
 * Usage:
 *   AGENT_URL=https://nexus-agent-production-7783.up.railway.app pnpm --prefix nexus-agent run smoke:live-triggers
 */
import "../lib/env.js";
import { generateAuthToken } from "../middleware/auth.js";

const wallet = (
  process.env.NEXT_PUBLIC_WALLET_ADDRESS || "0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b"
).toLowerCase();
const agent = process.env.AGENT_URL || "http://localhost:3001";

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

async function post(path: string) {
  const res = await fetch(`${agent}${path}`, { method: "POST", headers });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

console.log("\n=== Live Trigger Smoke ===");
console.log(`Agent:  ${agent}`);
console.log(`Wallet: ${wallet}\n`);

const health = await fetch(`${agent}/health`).then((r) => r.json());
ok("Agent health", health.status === "ok");

const guardian = await post("/api/trigger/guardian");
ok("POST /api/trigger/guardian", guardian.ok, JSON.stringify(guardian.data));

const dca = await post("/api/trigger/dca");
ok("POST /api/trigger/dca", dca.ok, JSON.stringify(dca.data));

const yieldTrig = await post("/api/trigger/yield");
ok("POST /api/trigger/yield", yieldTrig.ok, JSON.stringify(yieldTrig.data));

await new Promise((r) => setTimeout(r, 3000));

const minedRes = await fetch(`${agent}/api/feed/${wallet}?mined=true`);
const minedJson = await minedRes.json();
const minedItems = minedJson.items ?? minedJson.feed ?? [];
ok(
  "Mined feed available",
  minedRes.ok && Array.isArray(minedItems),
  `count=${minedItems.length}`,
);

const statsRes = await fetch(`${agent}/api/feed/${wallet}/stats`);
const stats = statsRes.ok ? await statsRes.json() : {};
ok(
  "Feed stats rotate rows",
  (stats.byAction?.rotate ?? 0) >= 3,
  `rotate=${stats.byAction?.rotate ?? 0}`,
);
ok(
  "Feed stats swap rows",
  (stats.byAction?.swap ?? 0) >= 1,
  `swap=${stats.byAction?.swap ?? 0}`,
);

const stubRecent = minedItems.slice(0, 5).some(
  (r: { status?: string; txHash?: string }) =>
    r.status === "simulated_stub" || (r.txHash && r.txHash.includes("11111111")),
);
ok("Recent mined feed has no stubs", !stubRecent);

console.log(`\n${failed === 0 ? "All checks passed." : `${failed} check(s) failed.`}\n`);
process.exit(failed > 0 ? 1 : 0);
