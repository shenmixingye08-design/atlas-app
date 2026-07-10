import type { ErrorCategoryId } from "@/lib/owner/error-monitoring/types";

import type { SystemServiceDefinition, SystemServiceId } from "./types";

export const SYSTEM_SERVICE_DEFINITIONS: readonly SystemServiceDefinition[] = [
  { id: "atlas", label: "ATLAS" },
  { id: "openai", label: "OpenAI" },
  { id: "stripe", label: "Stripe" },
  { id: "google", label: "Google" },
  { id: "x", label: "X" },
  { id: "wordpress", label: "WordPress" },
  { id: "server", label: "サーバー" },
] as const;

export const SYSTEM_SERVICE_IDS: readonly SystemServiceId[] =
  SYSTEM_SERVICE_DEFINITIONS.map((definition) => definition.id);

const ERROR_CATEGORY_TO_SERVICE: Partial<
  Record<ErrorCategoryId, SystemServiceId>
> = {
  openai: "openai",
  stripe: "stripe",
  google_auth: "google",
  x_post: "x",
  webhook: "atlas",
};

export function getSystemServiceDefinition(
  id: SystemServiceId,
): SystemServiceDefinition {
  const definition = SYSTEM_SERVICE_DEFINITIONS.find((entry) => entry.id === id);
  if (!definition) {
    throw new Error(`System service not found: ${id}`);
  }
  return definition;
}

export function isSystemServiceId(value: string): value is SystemServiceId {
  return SYSTEM_SERVICE_IDS.includes(value as SystemServiceId);
}

export function mapErrorCategoryToSystemService(
  categoryId: ErrorCategoryId,
): SystemServiceId | null {
  return ERROR_CATEGORY_TO_SERVICE[categoryId] ?? null;
}
