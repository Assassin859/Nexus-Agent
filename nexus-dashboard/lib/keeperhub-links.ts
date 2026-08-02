/** KeeperHub workflow IDs are short alphanumeric strings, not Postgres UUIDs. */
export function isKeeperHubWorkflowId(id: string): boolean {
  if (!id || id.includes("stub")) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return false;
  return id.length >= 8;
}

export const KEEPERHUB_MARKETPLACE_URL = "https://app.keeperhub.com/hub?tab=marketplace";

/** Deep workflow URLs 404 for viewers outside the Nexus Agent KeeperHub org (FRICTION-09). */
export const KEEPERHUB_WORKFLOW_LOGIN_HINT =
  "Requires sign-in to the Nexus Agent KeeperHub org. Use Tempo Explorer or Marketplace for public proof.";

export function keeperHubWorkflowUrl(id: string | null | undefined): string | null {
  if (!id || !isKeeperHubWorkflowId(id)) return null;
  return `https://app.keeperhub.com/workflows/${id}`;
}
