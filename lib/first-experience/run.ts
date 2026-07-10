import { submitWorkRequest } from "@/lib/workspace/orchestrate-client";

import {
  EMPLOYEE_STEP_DELAY_MS,
  FIRST_EXPERIENCE_PROGRESS_STEPS,
  getFirstExperienceTask,
  PROGRESS_STEP_DELAY_MS,
} from "./tasks";
import type {
  FirstExperienceEmployeeStep,
  FirstExperienceResult,
  FirstExperienceTaskId,
} from "./types";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export type FirstExperienceRunCallbacks = {
  onProgress?: (filled: number, total: number) => void;
  onEmployeeStep?: (step: FirstExperienceEmployeeStep, index: number) => void;
};

export async function runFirstExperienceTask(
  taskId: FirstExperienceTaskId,
  customText: string | undefined,
  callbacks: FirstExperienceRunCallbacks,
): Promise<FirstExperienceResult> {
  const task = getFirstExperienceTask(taskId, customText);
  const startedAt = Date.now();

  const orchestratePromise = submitWorkRequest(task.assignment, undefined, {
    metadata: { atlasFirstExperience: true },
  }).catch(() => null);

  for (const filled of FIRST_EXPERIENCE_PROGRESS_STEPS) {
    callbacks.onProgress?.(filled, 8);
    await sleep(PROGRESS_STEP_DELAY_MS);
  }

  for (let index = 0; index < task.employeeSteps.length; index += 1) {
    callbacks.onEmployeeStep?.(task.employeeSteps[index]!, index);
    await sleep(EMPLOYEE_STEP_DELAY_MS);
  }

  const orchestrateResult = await Promise.race([
    orchestratePromise,
    sleep(3000).then(() => null),
  ]);

  const durationSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
  const usedRealOrchestration = orchestrateResult?.status === "completed";

  let deliverable = task.deliverable;
  if (usedRealOrchestration && orchestrateResult?.deliverable?.content) {
    deliverable = {
      ...task.deliverable,
      preview: orchestrateResult.deliverable.content.slice(0, 280),
    };
  }

  return {
    taskId,
    jobCategory: task.jobCategory,
    durationSec,
    deliverable,
    leadEmployee: task.leadEmployee,
    saveLocation: task.saveLocation,
    nextIntegration: task.nextIntegration,
    usedRealOrchestration,
  };
}
