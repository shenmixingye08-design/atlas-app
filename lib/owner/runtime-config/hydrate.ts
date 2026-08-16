import "server-only";

import { ensureFeatureFlagsHydrated } from "@/lib/feature-flags/durable";
import { ensureBetaRuntimeHydrated } from "@/lib/owner/beta-users/durable";
import { ensureMaintenanceHydrated } from "@/lib/owner/system-status/maintenance-durable";

/** Load Owner runtime SoT before serving flags / maintenance / beta. */
export async function ensureOwnerRuntimeHydrated(): Promise<boolean> {
  const [flags, maintenance, beta] = await Promise.all([
    ensureFeatureFlagsHydrated(),
    ensureMaintenanceHydrated(),
    ensureBetaRuntimeHydrated(),
  ]);
  return flags && maintenance && beta;
}
