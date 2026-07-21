import { deliverableHasContent } from "@/lib/orchestration/deliverable-types";

import type { Project } from "./types";

/**
 * How the deep-link result view should present a resolved project.
 *
 * The whole point of 「結果を見る」 is that it NEVER lands on a blank screen:
 * every project resolves to exactly one of these states with Japanese copy.
 */
export type DeliverableDisplayState =
  | { kind: "ready" }
  | { kind: "generating"; message: string }
  | { kind: "failed"; message: string; reason: string | null }
  | { kind: "not_found"; message: string };

const GENERATING_MESSAGE = "まだ生成中です。少し時間をおいて、もう一度お試しください。";
const FAILED_MESSAGE = "生成に失敗しました。内容をご確認ください。";
const NOT_FOUND_MESSAGE =
  "この結果は見つかりませんでした。削除されたか、まだ保存が完了していない可能性があります。";

/** State for the case where no project row exists at all (durable miss). */
export function notFoundDisplayState(): Extract<
  DeliverableDisplayState,
  { kind: "not_found" }
> {
  return { kind: "not_found", message: NOT_FOUND_MESSAGE };
}

/**
 * Resolve how to render a project's deliverable. Pure + deterministic so the
 * data path is unit-testable independent of React.
 */
export function resolveDeliverableDisplayState(
  project: Project,
): DeliverableDisplayState {
  const result = project.result;

  if (result) {
    if (result.status === "failed") {
      return {
        kind: "failed",
        message: FAILED_MESSAGE,
        reason: sanitizeReason(project.error ?? result.error ?? null),
      };
    }

    const hasBody =
      deliverableHasContent(result.deliverable) ||
      Boolean(result.finalResponse?.trim());

    if (hasBody) {
      return { kind: "ready" };
    }

    // A result object without any body yet — treat as still generating rather
    // than showing an empty card.
    return { kind: "generating", message: GENERATING_MESSAGE };
  }

  // No result body persisted yet.
  if (project.error) {
    return {
      kind: "failed",
      message: FAILED_MESSAGE,
      reason: sanitizeReason(project.error),
    };
  }

  return { kind: "generating", message: GENERATING_MESSAGE };
}

function sanitizeReason(reason: string | null): string | null {
  if (!reason) return null;
  const trimmed = reason
    .replace(/sk-[a-zA-Z0-9]+/g, "")
    .replace(/OPENAI_[A-Z_]+/g, "")
    .trim();
  return trimmed.length > 0 ? trimmed.slice(0, 240) : null;
}
