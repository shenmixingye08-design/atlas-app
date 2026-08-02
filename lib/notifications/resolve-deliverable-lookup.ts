import "server-only";

import { loadPersistedProjectById } from "@/lib/commander/durable-store";
import { getCommanderRunDurable } from "@/lib/commander/run-store";
import { findWorkJobByLinkedIds } from "@/lib/work-jobs/store";
import { getStoredDeliverableForUser } from "@/lib/deliverables/store";
import type { GenerationFailureDiagnostic } from "@/lib/orchestration/generation-failure";
import type { ResultResolutionCode } from "@/lib/notifications/result-messages";
import type { NotificationRecord } from "@/lib/notifications/types";
import {
  resolveDeliverableDisplayState,
  type DeliverableDisplayState,
} from "@/lib/projects/deliverable-state";
import type { Project } from "@/lib/projects/types";

import type { DeliverableLookup } from "./result-resolution";
import {
  isDeliverableTargetType,
  looksLikeProjectId,
  resolveNotificationTarget,
} from "./result-target";

export type ResolvedDeliverableLookup = {
  lookup: DeliverableLookup;
  project: Project | null;
  /** Which id actually resolved (may differ from notification target). */
  resolvedProjectId: string | null;
  /** Diagnostics for logs / support — never shown raw to end users. */
  trace: {
    primaryTargetId: string | null;
    triedIds: string[];
    wordFileFound: boolean;
    wordFileId: string | null;
    commanderStatus: string | null;
    workJobStatus: string | null;
    workJobId: string | null;
    commanderRunId: string | null;
    projectError: string | null;
    resultStatus: string | null;
    generationFailure: GenerationFailureDiagnostic | null;
    fileDeliverableIds: string[];
  };
};

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

/**
 * Candidate project ids for a notification target.
 * Word-ready notifications used to store the .docx UUID as deliverableId —
 * also try commander-{requestId} so those rows still resolve.
 */
export function candidateProjectIdsForNotification(
  notification: NotificationRecord,
  primaryTargetId: string,
): string[] {
  const ids: string[] = [primaryTargetId];
  const requestId = notification.requestId?.trim();
  if (requestId) {
    ids.push(`commander-${requestId}`);
    // Work jobs sometimes store run id without prefix in requestId already.
    if (!requestId.startsWith("commander-")) {
      ids.push(`commander-${requestId.replace(/^cmdword_/, "")}`);
    }
  }
  const related = notification.relatedTaskId?.trim();
  if (related && looksLikeProjectId(related)) {
    ids.push(related);
  }
  // Dedupe preserving order
  return [...new Set(ids.filter(Boolean))];
}

function extractCommanderRunId(input: {
  notification: NotificationRecord;
  resolvedProjectId: string | null;
  project: Project | null;
}): string | null {
  const fromResult = input.project?.result?.commanderRunId?.trim();
  if (fromResult) return fromResult;
  const requestId = input.notification.requestId?.trim();
  if (requestId && !requestId.includes(":word")) return requestId;
  const projectId = input.resolvedProjectId ?? "";
  if (projectId.startsWith("commander-")) {
    return projectId.slice("commander-".length);
  }
  return null;
}

/**
 * Load the durable 成果物 for a notification, with Word-UUID → project fallback
 * and generating/failed/timeout awareness for missing rows.
 */
export async function resolveDeliverableLookupForNotification(input: {
  notification: NotificationRecord;
  userId: string;
}): Promise<ResolvedDeliverableLookup> {
  const target = resolveNotificationTarget(input.notification);
  const emptyTrace = {
    primaryTargetId: null as string | null,
    triedIds: [] as string[],
    wordFileFound: false,
    wordFileId: null as string | null,
    commanderStatus: null as string | null,
    workJobStatus: null as string | null,
    workJobId: null as string | null,
    commanderRunId: null as string | null,
    projectError: null as string | null,
    resultStatus: null as string | null,
    generationFailure: null as GenerationFailureDiagnostic | null,
    fileDeliverableIds: [] as string[],
  };

  if (target.kind === "none" || !isDeliverableTargetType(target.kind)) {
    return {
      lookup: { durable: true, found: false },
      project: null,
      resolvedProjectId: null,
      trace: emptyTrace,
    };
  }

  const triedIds: string[] = [];
  let lastDurable = true;
  let project: Project | null = null;
  let resolvedProjectId: string | null = null;

  for (const projectId of candidateProjectIdsForNotification(
    input.notification,
    target.targetId,
  )) {
    triedIds.push(projectId);
    const loaded = await loadPersistedProjectById({
      userId: input.userId,
      projectId,
    });
    if (!loaded.durable) {
      lastDurable = false;
      continue;
    }
    lastDurable = true;
    if (loaded.found && loaded.project) {
      project = loaded.project;
      resolvedProjectId = projectId;
      break;
    }
  }

  // If target was a Word file UUID, check Storage for the binary.
  let wordFileFound = false;
  let wordFileId: string | null = null;
  if (isUuidLike(target.targetId)) {
    wordFileId = target.targetId;
    const file = await getStoredDeliverableForUser(
      target.targetId,
      input.userId,
      { bypassMemory: true, bypassDisk: true },
    );
    wordFileFound = Boolean(file?.buffer?.byteLength);
  }
  // Also check fileDeliverables on a resolved project.
  if (!wordFileFound && project?.result?.fileDeliverables?.length) {
    const docx = project.result.fileDeliverables.find((f) => f.format === "docx");
    if (docx?.id) {
      wordFileId = docx.id;
      const file = await getStoredDeliverableForUser(docx.id, input.userId, {
        bypassMemory: true,
        bypassDisk: true,
      });
      wordFileFound = Boolean(file?.buffer?.byteLength);
    }
  }

  const commanderRunId = extractCommanderRunId({
    notification: input.notification,
    resolvedProjectId,
    project,
  });

  let commanderStatus: string | null = null;
  if (commanderRunId) {
    const run = await getCommanderRunDurable(commanderRunId, input.userId);
    commanderStatus = run?.status ?? null;
  }

  // WorkJob id ≠ commander run id. Resolve via durable ID links.
  let workJobStatus: string | null = null;
  let workJobId: string | null = null;
  const metaJobHint =
    typeof project?.result?.generationFailure?.workJobId === "string"
      ? project.result.generationFailure.workJobId
      : null;
  const linked = await findWorkJobByLinkedIds({
    userId: input.userId,
    workJobId: metaJobHint,
    commanderRunId,
    projectId: resolvedProjectId,
    // Only use requestId as job.id when it is a bare uuid that matches a job —
    // findWorkJobByLinkedIds enforces that.
    requestId: input.notification.requestId,
  });
  if (linked) {
    workJobId = linked.id;
    workJobStatus = linked.status;
  }

  const generationFailure =
    project?.result?.generationFailure ??
    (linked?.metadata?.generationFailure as GenerationFailureDiagnostic | undefined) ??
    null;

  const fileDeliverableIds = (project?.result?.fileDeliverables ?? []).map(
    (f) => f.id,
  );

  const trace = {
    primaryTargetId: target.targetId,
    triedIds,
    wordFileFound,
    wordFileId,
    commanderStatus,
    workJobStatus,
    workJobId,
    commanderRunId,
    projectError: project?.error ?? project?.result?.error ?? null,
    resultStatus: project?.result?.status ?? null,
    generationFailure,
    fileDeliverableIds,
  };

  if (!lastDurable && !project) {
    return {
      lookup: { durable: false },
      project: null,
      resolvedProjectId: null,
      trace,
    };
  }

  if (project) {
    const displayKind: DeliverableDisplayState["kind"] =
      resolveDeliverableDisplayState(project).kind;
    return {
      lookup: { durable: true, found: true, displayKind },
      project,
      resolvedProjectId,
      trace,
    };
  }

  // Project row missing — do NOT collapse to not_saved if we can classify.
  if (
    workJobStatus === "queued" ||
    workJobStatus === "running" ||
    commanderStatus === "running" ||
    commanderStatus === "planning" ||
    commanderStatus === "retrying"
  ) {
    return {
      lookup: {
        durable: true,
        found: true,
        displayKind: "generating",
      },
      project: null,
      resolvedProjectId: null,
      trace,
    };
  }

  if (
    workJobStatus === "failed" ||
    commanderStatus === "failed" ||
    commanderStatus === "cancelled"
  ) {
    return {
      lookup: {
        durable: true,
        found: true,
        displayKind: "failed",
      },
      project: null,
      resolvedProjectId: null,
      trace,
    };
  }

  // Word file exists under UUID target but project row missing — treat as
  // generating/recovery rather than "not saved forever".
  if (wordFileFound) {
    return {
      lookup: {
        durable: true,
        found: true,
        displayKind: "generating",
      },
      project: null,
      resolvedProjectId: null,
      trace,
    };
  }

  return {
    lookup: { durable: true, found: false },
    project: null,
    resolvedProjectId: null,
    trace,
  };
}

/** Map lookup + notification type to a clearer result code than blank not_saved. */
export function refineMissingDeliverableCode(input: {
  notification: NotificationRecord;
  trace: ResolvedDeliverableLookup["trace"];
}): ResultResolutionCode {
  const { notification, trace } = input;
  if (
    trace.workJobStatus === "queued" ||
    trace.workJobStatus === "running" ||
    trace.commanderStatus === "running" ||
    trace.commanderStatus === "planning" ||
    trace.commanderStatus === "retrying"
  ) {
    return "pending";
  }
  if (
    notification.type === "error" ||
    trace.workJobStatus === "failed" ||
    trace.commanderStatus === "failed"
  ) {
    return "generation_failed";
  }
  if (
    /timeout|Timeout|時間/i.test(notification.title) ||
    /timeout|Timeout|時間/i.test(notification.message)
  ) {
    return "pending"; // pending message covers retry; timeout title is on notification
  }
  return "not_saved";
}
