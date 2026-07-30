import { db } from "../db/client.js";
import { activeWorkflows, executionsLog } from "../db/schema.js";
import { resolveCronSchedule } from "../lib/cron.js";
import { eq, and } from "drizzle-orm";

export async function registerDcaWorkflow({
  userWallet,
  amount,
  cronSchedule,
  message,
}: {
  userWallet: string;
  amount: number;
  cronSchedule?: string;
  message?: string;
}): Promise<{ success: boolean; workflowId: string; message: string }> {
  const wallet = userWallet.toLowerCase();
  const schedule = resolveCronSchedule(cronSchedule, message);

  // Check if an active DCA workflow already exists for this wallet
  const existing = await db.query.activeWorkflows.findFirst({
    where: and(
      eq(activeWorkflows.userWallet, wallet),
      eq(activeWorkflows.type, "dca"),
      eq(activeWorkflows.status, "active")
    ),
  });

  let workflowId: string;

  if (existing) {
    // Upsert — update existing active DCA workflow row
    await db.update(activeWorkflows)
      .set({
        amount,
        cronSchedule: schedule,
      })
      .where(eq(activeWorkflows.id, existing.id));
    workflowId = existing.id;
  } else {
    // Insert new active DCA workflow row
    const [inserted] = await db.insert(activeWorkflows).values({
      userWallet: wallet,
      type: "dca",
      amount,
      cronSchedule: schedule,
      status: "active",
    }).returning({ id: activeWorkflows.id });
    workflowId = inserted.id;
  }

  // Audit log entry
  await db.insert(executionsLog).values({
    userWallet: wallet,
    workflowId,
    action: "swap",
    amount,
    status: "success",
    reason: `DCA workflow registered: ${amount} USDC into ETH (${schedule})`,
  });

  return {
    success: true,
    workflowId,
    message: `Successfully registered recurring DCA of ${amount} USDC into ETH (${schedule}).`,
  };
}
