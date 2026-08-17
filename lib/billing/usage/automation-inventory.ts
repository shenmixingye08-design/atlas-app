/**
 * Live count of automations that occupy a plan slot.
 * Archived / deleted do not consume the limit.
 * Paused / disabled / draft still occupy a slot until archived.
 */

export function isBillableAutomationStatus(status: string | null | undefined): boolean {
  return status !== "archived";
}

export async function listBillableAutomationIds(userId: string): Promise<string[]> {
  if (!userId.trim()) return [];

  const [{ listAutomationsV2FromSot }, { automationService }] = await Promise.all([
    import("@/lib/automation-platform/durable"),
    import("@/lib/automations/automation-service"),
  ]);

  const v2 = await listAutomationsV2FromSot(userId);
  const billableV2 = v2.filter((item) => isBillableAutomationStatus(item.status));
  const v1Linked = new Set(
    v2
      .map((item) => item.legacyAutomationId)
      .filter((id): id is string => Boolean(id)),
  );

  const v1 = await automationService.listForUser(userId);
  const extraV1 = v1.filter((item) => !v1Linked.has(item.id));
  return [...billableV2.map((item) => item.id), ...extraV1.map((item) => item.id)];
}

export async function countBillableAutomations(userId: string): Promise<number> {
  return (await listBillableAutomationIds(userId)).length;
}
