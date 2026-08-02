# Railway Deployment Guide — NexusAgent Production

> **Production backend:** `https://nexus-agent-production-7783.up.railway.app`  
> **Production dashboard:** `https://spirited-heart-production-b5c5.up.railway.app`  
> **Note:** Ollama-based deployment is **not used**. AI runs via OpenRouter API (serverless).

---

## 1. Services on Railway

| Service | Root directory | Purpose |
|---------|----------------|---------|
| **nexus-agent** | `nexus-agent` | Express API, cron modules, MCP client |
| **nexus-dashboard** | `nexus-dashboard` | Next.js 14 dashboard (judges' UI) |
| **Postgres** | Plugin | Shared state + `executions_log` (agent only) |

---

## 2. Environment variables — **nexus-agent** service

```env
OPENROUTER_API_KEY=sk-or-v1-...
BRAIN_MODEL=google/gemini-2.5-flash
DATABASE_URL=<Railway Postgres private URL>
ALCHEMY_RPC_URL=https://base-sepolia.g.alchemy.com/v2/...
KEEPERHUB_API_KEY=kh_...
KEEPERHUB_MCP_URL=https://app.keeperhub.com/mcp
KEEPERHUB_CHAIN_ID=84532
AGENTIC_WALLET_ADDRESS=0x...
JWT_SECRET=<strong random secret>
ALLOWED_ORIGINS=http://localhost:3000,https://spirited-heart-production-b5c5.up.railway.app
NODE_ENV=production
```

**Do not set on agent:** `NEXT_PUBLIC_*` (dashboard-only), `OLLAMA_*` (unused).

**Critical — CORS:** SIWE sign-in calls the agent **from the browser**. If `ALLOWED_ORIGINS` omits the dashboard URL, requests with that `Origin` header return **500 Internal Server Error**. Always include both localhost and the live dashboard URL.

**Critical:** `JWT_SECRET` on Railway must match local `.env` if you run `pnpm run phase2` against production with locally minted tokens.

Railway sets `PORT` automatically on each service.

---

## 3. Environment variables — **nexus-dashboard** service

Set **before build** (`NEXT_PUBLIC_*` is inlined at build time):

```env
NEXT_PUBLIC_AGENT_URL=https://nexus-agent-production-7783.up.railway.app
NEXT_PUBLIC_WALLET_ADDRESS=0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b
NODE_ENV=production
```

**Do not put on dashboard:** `DATABASE_URL`, `JWT_SECRET`, `KEEPERHUB_API_KEY`, `OPENROUTER_API_KEY`, `AGENTIC_WALLET_ADDRESS`, etc. Those belong on the agent service only.

**Build / start commands** (dashboard service):

```bash
npm install && npm run build
npm run start
```

**Next.js version:** Railway blocks deploys on `next@14.2.5` (CVE-2025-55184, CVE-2025-67779). Use **`next@14.2.35`** or newer (see `nexus-dashboard/package.json`).

---

## 4. Deploy steps

### Agent
1. Connect GitHub repo → service root `nexus-agent`
2. Add Postgres plugin → copy `DATABASE_URL`
3. Set agent env vars (§2) → **Redeploy**
4. Health check: `GET /health` → `{ "status": "ok" }`

### Dashboard
1. New service → root `nexus-dashboard`
2. Set dashboard env vars (§3) **before first build**
3. Build: `npm install && npm run build` · Start: `npm run start`
4. After deploy, confirm dashboard URL in agent `ALLOWED_ORIGINS` → **Redeploy agent**

---

## 5. Production parity test

```powershell
$env:AGENT_URL="https://nexus-agent-production-7783.up.railway.app"
pnpm --prefix nexus-agent run e2e
pnpm --prefix nexus-agent run phase2
pnpm --prefix nexus-agent run logs
```

Expect exit 0 and new rows in shared Postgres.

---

## 6. Dashboard smoke test (live URL)

1. Open https://spirited-heart-production-b5c5.up.railway.app
2. MetaMask → Base Sepolia → SIWE sign-in
3. Portfolio → live HF; **Integrations** card (4 Tempo txs + balance); **Query HF via Marketplace**
4. Feed → BaseScan repay links + **4× `tempo_transfer`** rows (Tempo Explorer)
5. Resilience → simulation cards
6. Paste `kh_...` → green MCP badge

**Automated Tier 2 smoke** (requires local `JWT_SECRET` matching Railway):

```bash
AGENT_URL=https://nexus-agent-production-7783.up.railway.app \
  pnpm --prefix nexus-agent exec tsx src/scripts/smoke-tier2-dashboard.ts
```

Expect: portfolio `tempo` block, HF-read proxy 200, feed `tempo_transfer` count ≥ 4.

Auth/settings use **Next.js API proxies** — browser does not call agent directly (no CORS config required for SIWE).

---

## 7. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Railway build blocked (Next.js CVE) | Upgrade to `next@14.2.35+` in `nexus-dashboard`, push, redeploy |
| Dashboard 404 "Application not found" | Deploy failed or service not running — check Railway build logs |
| SIWE / CORS errors (legacy direct calls) | Fixed in dashboard — auth proxied via Next.js; redeploy dashboard |
| 401 on API routes | JWT mismatch — align `JWT_SECRET` between sign-in and agent |
| Chat 404/429 | Set `BRAIN_MODEL=google/gemini-2.5-flash` on **agent** |
| `simulated_stub` in Feed | Warm MCP: `pnpm run surfaces`; confirm `KEEPERHUB_API_KEY` on **agent** |
| Agent crash on boot | `JWT_SECRET` required when `NODE_ENV=production` |
