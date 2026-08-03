/**
 * Publish NexusAgent HF-read workflow to KeeperHub marketplace.
 * Usage: pnpm --prefix nexus-agent run marketplace:publish-hf
 */
import "../lib/env.js";
import {
  callListedWorkflow,
  createWorkflowRaw,
  listOrgWorkflows,
  publishWorkflowListing,
  searchWorkflows,
  updateWorkflowListing,
  validateWorkflowGraph,
  updateWorkflowEnabled,
} from "../lib/mcp-client.js";
import {
  buildHfReadListingMetadata,
  buildHfReadWorkflowGraph,
  HF_READ_EXECUTION_CHAIN,
  HF_READ_LISTING_CHAIN,
  HF_READ_LISTING_SLUG,
  HF_READ_WORKFLOW_NAME,
} from "../lib/hf-read-workflow.js";

const TEST_WALLET =
  process.env.NEXT_PUBLIC_WALLET_ADDRESS ||
  "0x89f97Cb35236a1d0190FB25B31C5C0fF4107Ec1b";

async function main() {
  console.log("=================================================");
  console.log("NexusAgent — Publish HF-read marketplace listing");
  console.log("=================================================\n");

  if (!process.env.KEEPERHUB_API_KEY) {
    console.error("KEEPERHUB_API_KEY is required");
    process.exit(1);
  }

  const graph = buildHfReadWorkflowGraph();
  const listingMeta = buildHfReadListingMetadata();

  // Reuse existing workflow if already created
  const { workflows, isStub: listStub } = await listOrgWorkflows();
  let workflowId = workflows.find((w) => w.name === HF_READ_WORKFLOW_NAME)?.id;
  if (workflows.find((w) => w.listedSlug === HF_READ_LISTING_SLUG)) {
    workflowId = workflows.find((w) => w.listedSlug === HF_READ_LISTING_SLUG)!.id;
    console.log(`Found existing listed workflow: ${workflowId}`);
  } else if (workflowId) {
    console.log(`Found existing workflow (not listed): ${workflowId}`);
  } else {
    console.log("Creating workflow...");
    const created = await createWorkflowRaw({
      name: HF_READ_WORKFLOW_NAME,
      description:
        "Read-only Aave V3 health factor snapshot on Base Sepolia. Callable by external agents via marketplace.",
      nodes: graph.nodes,
      edges: graph.edges,
      enabled: false,
    });
    if (created.isStub) {
      console.error("create_workflow returned stub — check KEEPERHUB_API_KEY and MCP connectivity");
      process.exit(1);
    }
    workflowId = created.workflowId;
    console.log(`Created workflow: ${workflowId}`);
    console.log(`  https://app.keeperhub.com/workflows/${workflowId}`);
  }

  console.log("\nValidating workflow graph...");
  const validation = await validateWorkflowGraph(graph.nodes, graph.edges);
  if (validation.isStub) {
    console.warn("  validate_workflow skipped (MCP stub)");
  } else if (!validation.valid) {
    console.warn("  Validation warnings:", validation.errors?.join("; ") ?? "unknown");
  } else {
    console.log("  Graph valid");
  }

  console.log("\nUpdating listing chain for x402 wallet compatibility...");
  console.log(`  Execution chain (workflow node): ${HF_READ_EXECUTION_CHAIN} (Base Sepolia)`);
  console.log(`  Listing chain (payment/discovery): ${HF_READ_LISTING_CHAIN} (Base mainnet)`);
  const chainUpdate = await updateWorkflowListing(workflowId, { chain: HF_READ_LISTING_CHAIN });
  if (!chainUpdate.ok && !chainUpdate.isStub) {
    console.warn("  update_workflow_listing chain failed — retry or check KeeperHub MCP");
  } else {
    console.log(`  Listing chain set to ${HF_READ_LISTING_CHAIN}`);
  }

  console.log("\nSetting listing price (0.01 USDC/call)...");
  const { priceUsdcPerCall, ...publishMeta } = listingMeta;
  const priceUpdate = await updateWorkflowListing(workflowId, { priceUsdcPerCall });
  if (!priceUpdate.ok && !priceUpdate.isStub) {
    console.warn("  update_workflow_listing failed — may already be listed with price set");
  } else {
    console.log("  Price set to $0.01 USDC/call");
  }

  console.log("\nEnabling workflow for marketplace calls...");
  const enabled = await updateWorkflowEnabled(workflowId, true);
  console.log(enabled.ok ? "  Workflow enabled" : "  enable failed — call_workflow may return 503");

  console.log("\nPublishing to marketplace...");
  const published = await publishWorkflowListing(workflowId, publishMeta);
  if (!published.ok) {
    console.error("list_workflow failed — workflow may already be listed with same slug");
    if (listStub) process.exit(1);
  } else {
    console.log(`  Listed as slug: ${HF_READ_LISTING_SLUG}`);
    console.log(`  Marketplace: https://app.keeperhub.com/hub?tab=marketplace`);
  }

  console.log("\nSearching marketplace...");
  const search = await searchWorkflows(HF_READ_LISTING_SLUG, {
    chain: listingMeta.chain,
    workflowType: "read",
  });
  const hit = search.results.find(
    (r: any) => r.slug === HF_READ_LISTING_SLUG || r.listedSlug === HF_READ_LISTING_SLUG,
  );
  console.log(hit ? `  Found listing: ${JSON.stringify(hit).slice(0, 200)}...` : "  Listing not yet indexed (may take a minute)");

  console.log("\nSmoke: call_workflow...");
  try {
    const call = await callListedWorkflow(HF_READ_LISTING_SLUG, {
      walletAddress: TEST_WALLET,
    });
    if (call.is402) {
      console.log("  call_workflow returned 402 — paid listing works (x402 $0.01/call for external agents)");
    } else if (call.isStub) {
      console.warn("  call_workflow stub — MCP unavailable");
    } else {
      const raw = JSON.stringify(call.data);
      if (raw.includes("402") || raw.includes("Payment required")) {
        console.log("  call_workflow returned 402 — paid listing confirmed");
      } else {
        console.log("  Result:", raw.slice(0, 400));
      }
    }
  } catch (err) {
    console.warn("  call_workflow error:", err instanceof Error ? err.message : err);
  }

  console.log("\n=================================================");
  console.log("Done. Record in docs:");
  console.log(`  Workflow ID: ${workflowId}`);
  console.log(`  Slug: ${HF_READ_LISTING_SLUG}`);
  console.log("=================================================\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
