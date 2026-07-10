/** A discrete unit of work decomposed by the Planner. */
export type WorkTask = {
  id: number;
  title: string;
  description: string;
  /** Optional department hint from Planner output (e.g. `[Marketing]` tag). */
  department?: string;
  /** Task IDs that must complete before this task (inferred sequentially when omitted). */
  dependsOn?: number[];
};
