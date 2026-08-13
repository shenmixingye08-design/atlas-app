/**
 * Resolve latest Personal Memory at Automation step execution and apply
 * it to the real body that will be posted / generated.
 */

import "server-only";

import {
  artifactTypesForChannel,
  resolveMemoryArtifactTypes,
  type MemoryArtifactChannel,
} from "@/lib/memory-apply/channels";
import { recordMemoryApplyEvent } from "@/lib/memory-apply/metrics";
import { buildContentOverlay } from "@/lib/memory-apply/overlays";
import { applyPublishedBodyOverlay } from "@/lib/memory-apply/published-body";
import { resolveForContext } from "@/lib/personal-memory/service";
import type { PersonalMemoryScope } from "@/lib/personal-memory/types";

const STEP_BODY_SCOPES: readonly PersonalMemoryScope[] = [
  "writing_style",
  "work_content_style",
  "preferred_formats",
  "document_design",
  "wordpress_defaults",
  "recurring_work_preferences",
];

export type StepBodyMemoryApply = {
  text: string;
  applied: boolean;
  memoryIdsUsed: string[];
  appliedKeys: string[];
  channels: string[];
};

export async function applyMemoryToStepBody(input: {
  userId: string;
  channel: MemoryArtifactChannel;
  baseline: string;
  automationId?: string | null;
  assignment?: string | null;
}): Promise<StepBodyMemoryApply> {
  const baseline = (input.baseline ?? "").trim();
  if (!input.userId.trim() || !baseline) {
    return {
      text: baseline,
      applied: false,
      memoryIdsUsed: [],
      appliedKeys: [],
      channels: [],
    };
  }

  try {
    const artifactTypes = artifactTypesForChannel(input.channel);
    const { result, ledger } = await resolveForContext({
      userId: input.userId,
      automationId: input.automationId ?? undefined,
      notes: input.assignment ?? baseline.slice(0, 400),
      artifactTypes: artifactTypes.length > 0 ? artifactTypes : undefined,
      allowedScopes: STEP_BODY_SCOPES,
    });

    const overlay = buildContentOverlay({
      values: ledger.memoryValuesResolved,
      injectionText: result.injectionText,
    });
    const published = applyPublishedBodyOverlay(
      baseline,
      overlay,
      input.channel,
    );
    const memoryIdsUsed = ledger.memoryIdsUsed.filter(
      (id) => !id.startsWith("override:"),
    );
    const applied =
      memoryIdsUsed.length > 0 &&
      (published.text !== baseline || published.appliedKeys.length > 0);

    recordMemoryApplyEvent({
      userId: input.userId,
      channel:
        input.channel === "word"
          ? "word"
          : input.channel === "email"
            ? "notification"
            : "automation",
      memoryMode: applied ? "on" : "off",
      applied,
      memoryRetrieved: memoryIdsUsed.length > 0,
      memoryApplied: applied,
      memorySource: memoryIdsUsed.length > 0 ? "atlasPersonalMemory" : "none",
      appliedPreferenceKeys: published.appliedKeys,
      memoryIdsUsed,
      scopesUsed: [...new Set(ledger.memoryValuesResolved.map((row) => row.scope))],
      success: true,
    });

    return {
      text: published.text || baseline,
      applied,
      memoryIdsUsed,
      appliedKeys: published.appliedKeys,
      channels: [
        ...new Set(
          ledger.memoryValuesResolved.map((row) =>
            String(row.value.channel ?? input.channel),
          ),
        ),
      ],
    };
  } catch {
    return {
      text: baseline,
      applied: false,
      memoryIdsUsed: [],
      appliedKeys: [],
      channels: [],
    };
  }
}

function destinationChannelFromAssignment(
  assignment: string,
  stepTypes?: readonly string[] | null,
): MemoryArtifactChannel | null {
  const types = resolveMemoryArtifactTypes({
    assignment,
    stepTypes,
  });
  if (types.includes("x_post") && !types.includes("wordpress")) return "x_post";
  if (types.includes("wordpress") && !types.includes("x_post")) {
    return "wordpress";
  }
  if (types.includes("email")) return "email";
  return null;
}

/**
 * Chat / commander: overlay generated body with destination Memory
 * (X / WordPress) even when the content classifier said "document".
 */
export async function overlayChatDestinationBody(input: {
  userId: string;
  assignment: string;
  content: string;
  snsPost?: string | null;
  posts?: readonly string[] | null;
  markdown?: string | null;
  plainText?: string | null;
  stepTypes?: readonly string[] | null;
}): Promise<{
  channel: MemoryArtifactChannel | null;
  content: string;
  snsPost: string;
  posts: string[];
  markdown: string;
  plainText: string;
  memoryIdsUsed: string[];
  appliedKeys: string[];
}> {
  const snsPost = input.snsPost ?? "";
  const posts = [...(input.posts ?? [])];
  const markdown = input.markdown ?? "";
  const plainText = input.plainText ?? "";
  const channel = destinationChannelFromAssignment(
    input.assignment,
    input.stepTypes,
  );
  if (!channel || !input.userId.trim()) {
    return {
      channel,
      content: input.content,
      snsPost,
      posts,
      markdown,
      plainText,
      memoryIdsUsed: [],
      appliedKeys: [],
    };
  }

  const source =
    (channel === "x_post" && snsPost.trim() ? snsPost : input.content) ||
    input.content;
  const applied = await applyMemoryToStepBody({
    userId: input.userId,
    channel,
    baseline: source,
    assignment: input.assignment,
  });

  return {
    channel,
    content: applied.text || input.content,
    snsPost: channel === "x_post" ? applied.text || snsPost : snsPost,
    posts:
      channel === "x_post" && posts.length > 0
        ? posts.map(() => applied.text || source)
        : posts,
    markdown:
      markdown && (channel === "wordpress" || !snsPost.trim())
        ? applied.text || markdown
        : markdown,
    plainText: plainText ? applied.text || plainText : plainText,
    memoryIdsUsed: applied.memoryIdsUsed,
    appliedKeys: applied.appliedKeys,
  };
}
