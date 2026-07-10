import type { WorkTask } from "@/lib/agents/tasks/types";

/** Infer sequential dependencies when planner did not specify them. */
export function enrichTaskDependencies(tasks: WorkTask[]): WorkTask[] {
  return tasks.map((task, index) => {
    if (task.dependsOn && task.dependsOn.length > 0) return task;
    if (index === 0) return task;
    return { ...task, dependsOn: [tasks[index - 1]!.id] };
  });
}

export function topologicalSortTasks(tasks: WorkTask[]): WorkTask[] {
  const enriched = enrichTaskDependencies(tasks);
  const byId = new Map(enriched.map((t) => [t.id, t]));
  const visited = new Set<number>();
  const result: WorkTask[] = [];

  function visit(task: WorkTask) {
    if (visited.has(task.id)) return;
    visited.add(task.id);
    for (const depId of task.dependsOn ?? []) {
      const dep = byId.get(depId);
      if (dep) visit(dep);
    }
    result.push(task);
  }

  for (const task of enriched) visit(task);
  return result;
}

export function getTaskDependencyLabels(
  task: WorkTask,
  tasks: WorkTask[],
): string[] {
  if (!task.dependsOn?.length) return [];
  const byId = new Map(tasks.map((t) => [t.id, t.title]));
  return task.dependsOn
    .map((id) => byId.get(id))
    .filter((title): title is string => Boolean(title));
}
