import type {
  Automation,
  AutomationFilter,
  CreateAutomationInput,
  UpdateAutomationInput,
} from "../types";

/**
 * Persistence contract for {@link Automation} definitions.
 * Implementations: in-memory server store today; Supabase later.
 */
export interface AutomationRepository {
  list(filter?: AutomationFilter): Promise<Automation[]>;
  findById(id: string): Promise<Automation | null>;
  create(input: CreateAutomationInput): Promise<Automation>;
  update(id: string, patch: UpdateAutomationInput): Promise<Automation | null>;
  saveAll(automations: Automation[]): Promise<void>;
}
