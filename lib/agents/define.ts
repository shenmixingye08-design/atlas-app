import type { AgentDefinition } from "./types";

/**
 * Factory for creating type-safe agent definitions.
 * Ensures `id` and `role` stay in sync across all agents.
 */
export function defineAgent<T extends AgentDefinition>(definition: T): T {
  return definition;
}
