import "server-only";

import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";

import type { LearningEvent, LearningReport } from "./types";
import {
  listLearningEvents,
  listLearningReports,
  replaceLearningState,
  isLearningHydrated,
  markLearningHydrated,
} from "./store";

export const LEARNING_DOMAIN_KEY = "atlasLearning";

export type DurableLearningState = {
  events: LearningEvent[];
  reports: LearningReport[];
};

const MAX_CLERK_EVENTS = 40;
const MAX_CLERK_REPORTS = 5;

function compactLearning(state: DurableLearningState): DurableLearningState {
  return {
    events: state.events.slice(0, MAX_CLERK_EVENTS).map((event) => ({
      ...event,
      assignmentSummary: event.assignmentSummary.slice(0, 160),
    })),
    reports: state.reports.slice(0, MAX_CLERK_REPORTS).map((report) => ({
      ...report,
      insufficientMessage: report.insufficientMessage
        ? report.insufficientMessage.slice(0, 200)
        : null,
      sections: {
        improvements: report.sections.improvements.slice(0, 3),
        maintain: report.sections.maintain.slice(0, 3),
        recommendations: report.sections.recommendations.slice(0, 3),
        futureProposals: report.sections.futureProposals.slice(0, 3),
      },
    })),
  };
}

export function snapshotLearning(userId: string): DurableLearningState {
  return {
    events: listLearningEvents(userId),
    reports: listLearningReports(userId),
  };
}

export function schedulePersistLearning(userId: string): void {
  void persistDurableDomain(
    userId,
    LEARNING_DOMAIN_KEY,
    snapshotLearning(userId),
    { compact: compactLearning },
  );
}

export async function ensureLearningHydrated(userId: string): Promise<void> {
  if (isLearningHydrated(userId)) return;
  markLearningHydrated(userId);

  if (listLearningEvents(userId).length > 0 || listLearningReports(userId).length > 0) {
    return;
  }

  const loaded = await loadDurableDomain<DurableLearningState>(
    userId,
    LEARNING_DOMAIN_KEY,
  );
  if (!loaded) return;

  replaceLearningState(userId, {
    events: Array.isArray(loaded.events) ? loaded.events : [],
    reports: Array.isArray(loaded.reports) ? loaded.reports : [],
  });
}
