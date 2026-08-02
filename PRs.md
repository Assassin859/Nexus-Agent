# KeeperHub Onboarding UX Bounty — Pull Request Specifications

> **Status:** Upstream PR drafts for KeeperHub repo. Still valid for bounty submission. NexusAgent integration workarounds documented in [BUGS.md](BUGS.md).

---

## PR 1: Dynamic Testnet Workspace Hints

### Target File
- [getting-started-config.ts](file:///c:/Users/maitr/Downloads/keeperhub/lib/onboarding/getting-started-config.ts)

### The Friction Point
The "Get Started" onboarding launcher displays recommendation chips to guide developers in generating their first workflow. However:
- The suggested prompts are static strings lacking actual contract addresses (e.g., *"Monitor my Aave v3 health factor every hour and alert me when it drops below 1.5"*).
- The developer is forced to search externally for correct testnet addresses (like the Aave Sepolia Pool).
- The `walletAddress` property in `ChipContext` is gathered by the parent component but is completely ignored by `getMonitorTargets` and `getYieldStrategies`, rendering it useless.

### Proposed Fix
We will refactor both functions to consume the `walletAddress` to detect if the user's workspace is initialized on a test network (like Sepolia). 
- If a testnet is detected, the prompt strings will dynamically inject relevant active contract addresses (such as Aave V3 Sepolia Pool `0x6Ae43d3271ff68408378a467C62b15264c8d77e4` and Uniswap V3 Sepolia Router).
- We will add a `badge` or `isTestnet` field to the `Chip` configuration to visually indicate to the user in the UI that the recommended configuration is testnet-ready.
- We will add two new curated chips for **DCA bot** and **Recurring Payments** (direct onboarding pathways for NexusAgent).

### Code Changes Draft

```typescript
// Replace lines 121-145 in lib/onboarding/getting-started-config.ts
export function getMonitorTargets(ctx: ChipContext = {}): Chip[] {
  const isSepolia = ctx.walletAddress ? true : false; // Or check network prefix if available in context
  const aaveAddr = isSepolia 
    ? "0x6Ae43d3271ff68408378a467C62b15264c8d77e4" 
    : "Aave V3 Pool Address";

  return [
    {
      id: "aave-health",
      label: "Aave health factor",
      prompt: `Monitor my Aave v3 health factor at pool ${aaveAddr} and alert me when it drops below 1.5.`,
      workflowId: ctx.resolvedIds?.["aave-health"],
    },
    {
      id: "dca-swap",
      label: "USDC to ETH DCA",
      prompt: "Swap 100 USDC for ETH every week on Sepolia using Uniswap V3.",
      workflowId: ctx.resolvedIds?.["dca-swap"],
    },
    ...
  ];
}
```

---

## PR 2: Dev-Login Automatic Database Recovery

### Target File
- [dev-login.ts](file:///c:/Users/maitr/Downloads/keeperhub/scripts/dev-login.ts)

### The Friction Point
Local developer environment setup via `pnpm dev:login` executes database migrations via `dev:bootstrap`. However:
- If a contributor has previously run `pnpm db:push` to test local schemas, the database contains migrations that are out-of-sync with Drizzle's migration journal.
- This mismatch causes `pnpm dev:bootstrap` to crash silently during Postgres initialization.
- The command terminates with `exited with status 1` without descriptive errors or actionable instructions.

### Proposed Fix
We will modify the execution step inside `dev-login.ts` to catch bootstrap errors:
- If the child process fails, we will parse the stdout/stderr for database migration mismatches (specifically table collisions in `drizzle.__drizzle_migrations` or matching relational mismatch messages).
- When a collision is identified, the script will automatically invoke `pnpm tsx scripts/backfill-drizzle-migrations.ts` to rebuild the migration journal.
- Print clear terminal logs guiding the developer:
  ```
  > Migration drift detected (relational collision in drizzle.__drizzle_migrations).
  > Running scripts/backfill-drizzle-migrations.ts automatically...
  > Success! Re-running bootstrap...
  ```

### Code Changes Draft

```typescript
// Modify runStep in scripts/dev-login.ts to support error handling & recovery
function runStep(
  label: string,
  script: string,
  args: string[],
  extraEnv: Record<string, string> = {}
): void {
  console.log(`> ${label}`);
  const env = { ...process.env, ...extraEnv } as NodeJS.ProcessEnv;
  const result = spawnSync("pnpm", ["tsx", script, ...args], {
    stdio: "pipe", // Capture stdout/stderr to inspect errors
    env,
  });

  if (result.status !== 0) {
    const errorOutput = result.stderr?.toString() || result.stdout?.toString() || "";
    
    // Check if the crash is due to drizzle migration mismatch
    if (script.includes("dev-bootstrap") && errorOutput.includes("relation already exists")) {
      console.warn("\n⚠️  [Migration Mismatch Detected] Local DB journal is out of sync.");
      console.log("> Running backfill-drizzle-migrations.ts to repair local schema...");
      
      const repairResult = spawnSync("pnpm", ["tsx", "scripts/backfill-drizzle-migrations.ts"], {
        stdio: "inherit",
        env,
      });

      if (repairResult.status === 0) {
        console.log("✓ Migration journal repaired. Retrying bootstrap...\n");
        // Retry the original bootstrap step
        const retryResult = spawnSync("pnpm", ["tsx", script, ...args], {
          stdio: "inherit",
          env,
        });
        if (retryResult.status === 0) return;
      }
    }
    
    process.stderr.write(errorOutput);
    throw new Error(`${label} exited with status ${result.status ?? "null"}`);
  }
}
```

---

## PR 3: Troubleshooting & Key Classification Documentation

### Target File
- [quickstart.md](file:///c:/Users/maitr/Downloads/keeperhub/docs/getting-started/quickstart.md)

### The Friction Point
The Quick Start Guide explains how to run an error-free path. However, first-time builders frequently encounter the following roadblocks which are undocumented:
- **HTTP 429 Rate Limits:** Hitting execution bottlenecks during high-frequency testing loops.
- **OAuth Browser Redirection Timeout:** Connecting the MCP server locally behind a proxy or inside Docker containers without host networking configured.
- **API Key Mismatch:** Cryptic `401 Unauthorized` responses caused by passing an org-level `kh_` key instead of a workspace-builder `wfb_` key to triggers.
- **Sepolia Testnet Funding:** No clear direction on where to acquire Sepolia ETH/USDC.

### Proposed Fix
We will append a dedicated **Troubleshooting & Common Errors** section directly at the bottom of the public-facing markdown file (`docs/getting-started/quickstart.md`).

### Documentation Additions Draft

```markdown
## Troubleshooting & Common Errors

### 1. HTTP 429 (Rate Limited)
If your agent loop or triggers fire too frequently during development, the KeeperHub API may return an HTTP `429 Too Many Requests`. 
- **Solution:** Implement exponential backoff in your client loop. In local development environments, check your rate-limit headers to monitor remaining allocation window sizes.

### 2. OAuth Handshake Redirect Timeout
When running `claude mcp add ...` or starting the local MCP daemon, the browser authorization redirection can time out if you are developing inside a containerized sandbox or virtual machine.
- **Solution:** Expose port `3000` to your host machine, or configure `DEV_LOGIN_URL` in your `.env.local` file to point to your external routing IP.

### 3. API Key Authorization Failures (HTTP 401)
If your API queries return unauthorized errors, verify your prefix:
- **`kh_...` (Organization Keys):** Used for managing settings, querying audit logs via MCP, and running command-line integrations.
- **`wfb_...` (Workflow Trigger Keys):** Used exclusively to authenticate execution calls targeting specific Webhook trigger URLs.

### 4. Getting Sepolia Testnet Funds
To run workflows on the Sepolia Test Network without spending real ether, you must fund your Turnkey/Para agentic wallet.
- **Solution:** Copy your wallet address from the profile dropdown, navigate to a Sepolia Faucet (such as `sepoliafaucet.com`), and request testnet ETH.
```
