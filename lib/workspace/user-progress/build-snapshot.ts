import {
  doneStepIndex,
  fileStepIndex,
  getUserProgressSteps,
} from "./steps";
import type {
  UserProgressSessionRecord,
  UserProgressSnapshot,
  UserProgressStepView,
} from "./types";

export function buildUserProgressSnapshot(
  session: UserProgressSessionRecord,
): UserProgressSnapshot {
  const defs = getUserProgressSteps(session.kind);
  const fileIdx = fileStepIndex(session.kind);
  const doneIdx = doneStepIndex(session.kind);

  let activeIndex = 0;
  if (session.failed) {
    activeIndex = Math.min(session.orchestrationStepIndex, fileIdx);
  } else if (session.completed) {
    activeIndex = doneIdx;
  } else if (session.fileGenerating) {
    activeIndex = fileIdx;
  } else {
    activeIndex = Math.min(session.orchestrationStepIndex, fileIdx - 1);
  }

  const steps: UserProgressStepView[] = defs.map((def, index) => {
    if (session.completed && !session.failed) {
      return { ...def, status: "completed" };
    }
    if (index < activeIndex) return { ...def, status: "completed" };
    if (index === activeIndex) return { ...def, status: "current" };
    return { ...def, status: "pending" };
  });

  const progressPercent = session.completed
    ? 100
    : Math.round(((activeIndex + (session.failed ? 0 : 0.45)) / doneIdx) * 100);

  const current = steps[activeIndex] ?? steps[0]!;
  const headline = session.failed
    ? "うまくいきませんでした。内容を確認してください。"
    : current.activeLabel;

  return {
    sessionId: session.sessionId,
    kind: session.kind,
    phase: session.phase,
    orchestrationStep: session.orchestrationStep,
    activeStepIndex: activeIndex,
    steps,
    progressPercent: Math.min(100, Math.max(0, progressPercent)),
    headline,
    updatedAt: session.updatedAt,
  };
}
