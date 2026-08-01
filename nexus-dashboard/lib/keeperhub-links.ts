/** KeeperHub workflow IDs are short alphanumeric strings, not Postgres UUIDs. */
export function isKeeperHubWorkflowId(id: string): boolean {
  if (!id || id.includes("stub")) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return false;
  return id.length >= 8;
}

export function keeperHubWorkflowUrl(id: string | null | undefined): string | null {
  if (!id || !isKeeperHubWorkflowId(id)) return null;
  return `https://app.keeperhub.com/workflows/${id}`;
}
