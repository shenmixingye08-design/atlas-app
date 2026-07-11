/** Fire-and-forget client audit beacon (authenticated). */
export function reportClientAuditEvent(input: {
  action: "data_export" | "request_delete" | "logout";
  targetId?: string | null;
  result?: "success" | "failure";
  reason?: string | null;
}): void {
  void fetch("/api/audit/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: input.action,
      targetId: input.targetId ?? null,
      result: input.result ?? "success",
      reason: input.reason ?? null,
    }),
    keepalive: true,
  }).catch(() => {
    // best-effort
  });
}
