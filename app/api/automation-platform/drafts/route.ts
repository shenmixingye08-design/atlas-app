import { AutomationPlatformError } from "@/lib/automation-platform/errors/messages";
import { jsonError } from "@/lib/automation-platform/http/respond";
import {
  deleteDraftForUser,
  listDraftsForUser,
  upsertDraftForUser,
} from "@/lib/automation-platform/wizard/draft-store";
import type { AutomationWizardDraft } from "@/lib/automation-platform/wizard/types";
import { isFeatureEnabled } from "@/lib/feature-flags/access";
import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { auth } from "@clerk/nextjs/server";

function isDraft(value: unknown): value is AutomationWizardDraft {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AutomationWizardDraft).draftId === "string" &&
    Array.isArray((value as AutomationWizardDraft).steps)
  );
}

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return jsonError(new AutomationPlatformError("automation_unauthorized"), {
      actorUserId: null,
      action: "automation.draft.list",
    });
  }

  try {
    const context = await resolveFeatureAccessContext();
    if (!isFeatureEnabled("automation_v2_enabled", context)) {
      throw new AutomationPlatformError("automation_feature_disabled");
    }
    const drafts = await listDraftsForUser(userId);
    return Response.json({ drafts });
  } catch (error) {
    return jsonError(error, {
      actorUserId: userId,
      action: "automation.draft.list",
    });
  }
}

export async function PUT(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return jsonError(new AutomationPlatformError("automation_unauthorized"), {
      actorUserId: null,
      action: "automation.draft.save",
    });
  }

  try {
    const context = await resolveFeatureAccessContext();
    if (!isFeatureEnabled("automation_v2_enabled", context)) {
      throw new AutomationPlatformError("automation_feature_disabled");
    }

    const body = (await request.json()) as { draft?: unknown };
    if (!isDraft(body.draft)) {
      throw new AutomationPlatformError("automation_invalid_definition", {
        field: "draft",
      });
    }

    // Ownership: draft belongs to caller only — never accept another user's id in payload for auth
    const draft = await upsertDraftForUser(userId, body.draft);
    return Response.json({ draft, savedAt: draft.savedAt });
  } catch (error) {
    return jsonError(error, {
      actorUserId: userId,
      action: "automation.draft.save",
    });
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return jsonError(new AutomationPlatformError("automation_unauthorized"), {
      actorUserId: null,
      action: "automation.draft.delete",
    });
  }

  try {
    const context = await resolveFeatureAccessContext();
    if (!isFeatureEnabled("automation_v2_enabled", context)) {
      throw new AutomationPlatformError("automation_feature_disabled");
    }
    const draftId = new URL(request.url).searchParams.get("draftId");
    if (!draftId) {
      throw new AutomationPlatformError("automation_invalid_definition", {
        field: "draftId",
      });
    }
    await deleteDraftForUser(userId, draftId);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error, {
      actorUserId: userId,
      action: "automation.draft.delete",
    });
  }
}
