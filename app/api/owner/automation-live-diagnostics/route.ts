import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { diagnoseAutomationLiveEnvironment } from "@/lib/automation-platform/adapters/env-diagnostics";
import { listLiveStepAdapterTypes } from "@/lib/automation-platform/adapters/registry";

export async function GET(): Promise<Response> {
  await requireAtlasOwner();

  return Response.json({
    checkedAt: new Date().toISOString(),
    environment: diagnoseAutomationLiveEnvironment(),
    liveAdapters: listLiveStepAdapterTypes(),
    notes: [
      "Secret values are never returned.",
      "User OAuth tokens / WordPress site credentials are checked per-user at preflight/execute time.",
      "Queue uses durable AutomationRun + atlasAutomationDispatchV2 leases (no Redis/SQS broker).",
      "AUTOMATION_E2E_LIVE_EXTERNAL is optional Live E2E opt-in; production adapters call real APIs when connected.",
    ],
  });
}
