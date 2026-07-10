import type { DepartmentDefinition } from "./types";

/** Factory for type-safe department definitions. */
export function defineDepartmentDefinition<T extends DepartmentDefinition>(
  definition: T,
): T {
  return definition;
}
