import type { Department, Employee } from "./types";

/**
 * Factory for creating type-safe department definitions.
 */
export function defineDepartment<T extends Department>(definition: T): T {
  return definition;
}

/**
 * Factory for creating type-safe employee definitions.
 */
export function defineEmployee<T extends Employee>(definition: T): T {
  return definition;
}
