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
  /** Soft-delete: remove from active store; durable layer marks deleted_at. */
  delete(id: string): Promise<boolean>;
  saveAll(automations: Automation[]): Promise<void>;
}
