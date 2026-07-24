import { auth } from "@clerk/nextjs/server";

import { automationService } from "@/lib/automations/automation-service";
import {
  getPendingXPost,
  listPendingXPostsForUser,
  updatePendingXPost,
} from "@/lib/automations/x-recurring/pending-store";
import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { postTweetAutoForUser } from "@/lib/integrations/x/post/service";
import {
  notifyXRecurringPostFailed,
  notifyXRecurringPostSuccess,
} from "@/lib/notifications/emitters";
import { getXRecurringError } from "@/lib/automations/x-recurring/errors";

export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const automationId = url.searchParams.get("automationId") ?? undefined;
  const status = url.searchParams.get("status") as
    | "pending"
    | "posted"
    | "skipped"
    | "failed"
    | null;

  const items = listPendingXPostsForUser(userId, {
    automationId,
    status: status ?? "pending",
  });

  return Response.json({ items });
}

type ActionBody = {
  id?: unknown;
  action?: unknown;
  text?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ActionBody;
  try {
    body = (await request.json()) as ActionBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  const action =
    body.action === "publish" ||
    body.action === "skip" ||
    body.action === "edit"
      ? body.action
      : null;

  if (!id || !action) {
    return Response.json(
      { error: "id and action are required" },
      { status: 400 },
    );
  }

  const pending = getPendingXPost(userId, id);
  if (!pending) {
    return Response.json({ error: "確認待ち投稿が見つかりません" }, { status: 404 });
  }

  if (pending.status === "posted") {
    return Response.json({
      status: "already_posted",
      item: pending,
      message: getXRecurringError("duplicate_execution").message,
    });
  }

  if (action === "skip") {
    const updated = updatePendingXPost(id, { status: "skipped" });
    return Response.json({ status: "skipped", item: updated });
  }

  const text =
    action === "edit" && typeof body.text === "string" && body.text.trim()
      ? body.text.trim()
      : pending.generatedText;

  if (!text.trim()) {
    return Response.json(
      {
        error: getXRecurringError("x_text_empty").message,
        errorCode: "x_text_empty",
      },
      { status: 400 },
    );
  }

  if (action === "edit") {
    const updated = updatePendingXPost(id, {
      generatedText: text,
      status: "pending",
    });
    return Response.json({ status: "edited", item: updated });
  }

  const automation = await automationService.getByIdForUser(
    pending.automationId,
    userId,
  );
  if (!automation) {
    return Response.json({ error: "定期仕事が見つかりません" }, { status: 404 });
  }

  const context = await resolveFeatureAccessContext();
  const result = await postTweetAutoForUser({
    userId,
    text,
    context,
    automationId: pending.automationId,
  });

  if (result.status !== "ready" || result.history?.status !== "success") {
    const message =
      result.status === "ready"
        ? result.history?.errorMessage ?? "Xへの投稿に失敗しました"
        : result.message;
    updatePendingXPost(id, {
      status: "failed",
      errorCode: "x_auth_failed",
      errorMessage: message,
    });
    notifyXRecurringPostFailed(userId, {
      automationId: pending.automationId,
      executionId: pending.id,
      errorMessage: message,
    });
    return Response.json(
      { error: message, item: getPendingXPost(userId, id) },
      { status: 400 },
    );
  }

  const updated = updatePendingXPost(id, {
    status: "posted",
    generatedText: text,
    xPostId: result.history.tweetId,
    xPostUrl: result.history.tweetUrl,
    postedAt: result.history.postedAt,
    errorCode: null,
    errorMessage: null,
  });

  notifyXRecurringPostSuccess(userId, {
    automationId: pending.automationId,
    executionId: pending.id,
  });

  return Response.json({ status: "posted", item: updated });
}
