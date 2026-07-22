import { auth } from "@clerk/nextjs/server";

import {
  AUTOMATION_DRAFT_DOMAIN,
  buildDraftEnvelope,
  type AutomationDraftEnvelope,
} from "@/lib/automations/wizard-draft";
import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";

function compactDraft(payload: AutomationDraftEnvelope): AutomationDraftEnvelope {
  return {
    ...payload,
    wizard: {
      ...payload.wizard,
      assignment: payload.wizard.assignment.slice(0, 2000),
      title: payload.wizard.title.slice(0, 120),
      description: payload.wizard.description.slice(0, 500),
    },
  };
}

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loaded = await loadDurableDomain<AutomationDraftEnvelope>(
    userId,
    AUTOMATION_DRAFT_DOMAIN,
  );
  return Response.json(loaded ?? null);
}

export async function PUT(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const envelope = (await request.json()) as AutomationDraftEnvelope;
  await persistDurableDomain(
    userId,
    AUTOMATION_DRAFT_DOMAIN,
    envelope,
    { compact: compactDraft, forceSupabase: true },
  );
  return Response.json({ ok: true });
}

export async function DELETE(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { defaultWizardState } = await import("@/lib/automations/wizard-state");
  const empty = buildDraftEnvelope(defaultWizardState());
  await persistDurableDomain(userId, AUTOMATION_DRAFT_DOMAIN, empty, {
    compact: (p) => p,
    forceSupabase: true,
  });
  return Response.json({ ok: true });
}
