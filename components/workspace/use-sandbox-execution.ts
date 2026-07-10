"use client";

import { useEffect, useState } from "react";

import type { ActionRequest } from "@/lib/actions/types";
import {
  advanceExecution,
  createSandboxPlan,
  PHASE_DURATIONS_MS,
  PHASE_ORDER,
  type SimulatedExecution,
} from "@/lib/execution";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** Run sandbox execution simulation for Action Engine tasks. */
export function useSandboxExecution(actions: readonly ActionRequest[]) {
  const [executions, setExecutions] = useState<SimulatedExecution[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (actions.length === 0) {
      setExecutions([]);
      setIsRunning(false);
      setIsComplete(false);
      return;
    }

    let cancelled = false;
    const plan = createSandboxPlan(actions);
    setExecutions(plan.executions);
    setIsRunning(true);
    setIsComplete(false);

    async function simulate() {
      const state = [...plan.executions];

      for (let actionIndex = 0; actionIndex < state.length; actionIndex += 1) {
        let elapsed = 0;

        for (const phase of PHASE_ORDER) {
          if (cancelled) return;

          state[actionIndex] = advanceExecution(
            state[actionIndex]!,
            phase,
            elapsed,
          );
          setExecutions([...state]);

          if (phase !== "completed") {
            await sleep(PHASE_DURATIONS_MS[phase]);
            elapsed += PHASE_DURATIONS_MS[phase];
          }
        }
      }

      if (!cancelled) {
        setIsRunning(false);
        setIsComplete(true);
      }
    }

    void simulate();

    return () => {
      cancelled = true;
    };
  }, [actions]);

  return { executions, isRunning, isComplete };
}
