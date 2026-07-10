/**
 * ATLAS Prompt Ownership
 * ======================
 *
 * All AI prompt text lives under `lib/prompts/`. Do not embed prompt strings in
 * orchestration logic, UI components, or API routes.
 *
 * Directory layout
 * ----------------
 * - `lib/prompts/system/`   Employee identity & behavior → Responses API `instructions`
 * - `lib/prompts/workflow/` Pipeline step prompts → Responses API `input` task section
 *
 * Adding a new employee
 * ---------------------
 * 1. Add a system prompt constant in `lib/prompts/system/{department}.ts`
 * 2. Wire it in `lib/employees/employees/{department}.ts` via `systemPrompt: ...`
 * 3. Optionally set `workflowAgentId` if this employee drives a workflow agent role
 *
 * Adding / editing a workflow step prompt
 * ----------------------------------------
 * 1. Edit the relevant file in `lib/prompts/workflow/` (ceo, planner, worker, reviewer)
 * 2. Orchestrator consumes these via `@/lib/agents/tasks` (re-exports for compatibility)
 *
 * System vs workflow prompts
 * --------------------------
 * - **System** — who the employee is, standing responsibilities, tone, default output habits
 * - **Workflow** — one-shot instructions for a specific pipeline step in a run
 */

export * from "./system";
export * from "./workflow";
export * from "./excellence";
