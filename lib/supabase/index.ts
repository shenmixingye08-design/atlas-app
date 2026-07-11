export type { SupabaseEnv, ProjectStorageBackend } from "./env";
export {
  getBrowserSupabaseEnv,
  getServerSupabaseEnv,
  isSupabaseConfigured,
  resolveProjectStorageBackend,
} from "./env";
export { createClient, createClientIfConfigured } from "./client";
export { createClient as createServerClient, createClientIfConfigured as createServerClientIfConfigured } from "./server";
export { createServiceRoleClientIfConfigured } from "./service-role";
export type { Database } from "./database.types";
