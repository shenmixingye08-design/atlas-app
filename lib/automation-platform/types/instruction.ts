/**
 * Instruction layers — never merge silently when structured and freeform conflict.
 *
 * Priority (highest → lowest):
 * 1. Explicit structuredOptions (this edit)
 * 2. freeformNotes (this edit)
 * 3. Automation-saved settings
 * 4. User memory (if allowed)
 * 5. System defaults
 */

export type StructuredOptions = Readonly<Record<string, unknown>>;

export type AutomationInstruction = {
  structuredOptions: StructuredOptions;
  freeformNotes: string;
};

export type InstructionConflict = {
  field: string;
  structuredValue: unknown;
  freeformSignal: string;
  message: string;
};

export type InstructionAssumption = {
  field: string;
  value: unknown;
  reason: string;
  source: "freeform" | "memory" | "system_default" | "automation_saved";
};

export type ResolvedInstruction = {
  structuredOptions: StructuredOptions;
  freeformNotes: string;
  merged: Readonly<Record<string, unknown>>;
  assumptions: InstructionAssumption[];
  conflicts: InstructionConflict[];
  requiresUserConfirmation: boolean;
};

export const DEFAULT_INSTRUCTION: AutomationInstruction = {
  structuredOptions: {},
  freeformNotes: "",
};
