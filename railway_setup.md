# Railway Deployment Guide — NexusAgent Production

> **Production backend:** `https://nexus-agent-production-7783.up.railway.app`  
> **Note:** Ollama-based deployment is **not used**. AI runs via OpenRouter API (serverless).

---

## 1. Services on Railway

| Service | Type | Purpose |
|---------|------|---------|
| **nexus-agent** | Node.js | Express API, cron modules, MCP client |
| **Postgres** | Plugin | Shared state + `executions_log` |

Dashboard (`nexus-dashboard`) can run locally or on Vercel/Railway with `NEXT_PUBLIC_AGENT_URL` pointing at the agent service.

---

## 2. Required environment variables (nexus-agent)

```env
OPENROUTER_API_KEY=sk-or-v1-...
BRAIN_MODEL=google/gemini-2.5-flash
DATABASE_URL=<Railway Postgres private URL>
ALCHEMY_RPC_URL=https://base-sepolia.g.alchemy.com/v2/...
KEEPERHUB_API_KEY=kh_...
AGENTIC_WALLET_ADDRESS=0x...
JWT_SECRET=<strong random secret>
ALLOWED_ORIGINS=http://localhost:3000,https://your-dashboard.app
NODE_ENV=production
PORT=3001
```

**Critical:** `JWT_SECRET` on Railway must match local `.env` if you run `pnpm run phase2` against production with locally minted tokens.

---

## 3. Deploy steps

1. Connect GitHub repo to Railway
2. Set root directory / start command: `pnpm --prefix nexus-agent start` (after `build`)
3. Add Postgres plugin → copy `DATABASE_URL`
4. Set all env vars above → **Redeploy**
5. Health check: `GET /health` → `{ "status": "ok" }`

---

## 4. Production parity test

```powershell
$env:AGENT_URL="https://nexus-agent-production-7783.up.railway.app"
pnpm --prefix nexus-agent run phase2
pnpm --prefix nexus-agent run logs
```

Expect exit 0 and new rows in shared Postgres.

---

## 5. Dashboard connection

```env
# nexus-dashboard/.env.local or Vercel env
NEXT_PUBLIC_AGENT_URL=https://nexus-agent-production-7783.up.railway.app
NEXT_PUBLIC_WALLET_ADDRESS=0x89f97cb35236a1d0190fb25b31c5c0ff4107ec1b
```

---

## 6. Troubleshooting

| Symptom | Fix |
|---------|-----|
| 401 on API routes | JWT mismatch — align `JWT_SECRET` |
| Chat 404/429 | Set `BRAIN_MODEL=google/gemini-2.5-flash` |
| `simulated_stub` in Feed | Warm MCP: `pnpm run surfaces`; confirm `KEEPERHUB_API_KEY` |
| Agent crash on boot | `JWT_SECRET` required when `NODE_ENV=production` |
