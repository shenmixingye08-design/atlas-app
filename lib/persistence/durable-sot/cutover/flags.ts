/**
 * Phase 1-5 cutover flags.
 * Production cannot re-enable legacy SoT via env (fail-closed).
 */

export type DurableSotCutoverFlags = {
  /** Production-like runtime (Vercel / NODE_ENV=production / explicit cutover). */
  productionRuntime: boolean;
  /** Durable SoT is the SoT (default true). */
  durableSotEnabled: boolean;
  /** Legacy file/memory/legacy-pg read — never true in production. */
  legacyStoreReadEnabled: boolean;
  /** Legacy file/memory/legacy-pg write — never true in production. */
  legacyStoreWriteEnabled: boolean;
};

function truthy(value: string | undefined): boolean {
  const v = value?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function falsy(value: string | undefined): boolean {
  const v = value?.trim().toLowerCase();
  return v === "false" || v === "0" || v === "no";
}

export function isProductionRuntime(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.NODE_ENV === "production") return true;
  if (truthy(env.VERCEL)) return true;
  if (truthy(env.ATLAS_DURABLE_SOT_CUTOVER)) return true;
  return false;
}

/**
 * Resolve cutover flags.
 * Production: durable on, legacy always off (env cannot override).
 * Non-production: legacy only when explicitly enabled (tests set WRITE=true).
 */
export function resolveDurableSotCutoverFlags(
  env: NodeJS.ProcessEnv = process.env,
): DurableSotCutoverFlags {
  const productionRuntime = isProductionRuntime(env);
  const durableSotEnabled = !falsy(env.ATLAS_DURABLE_SOT_ENABLED);

  if (productionRuntime) {
    return {
      productionRuntime: true,
      durableSotEnabled: true,
      legacyStoreReadEnabled: false,
      legacyStoreWriteEnabled: false,
    };
  }

  return {
    productionRuntime: false,
    durableSotEnabled,
    legacyStoreReadEnabled: truthy(env.ATLAS_LEGACY_STORE_READ_ENABLED),
    legacyStoreWriteEnabled: truthy(env.ATLAS_LEGACY_STORE_WRITE_ENABLED),
  };
}
