import type { SalesCostMode, SalesMaterialSessionConfig } from "./types";

/** Extract sales-material session config from orchestration metadata. */
export function readSalesMaterialConfig(
  metadata: Readonly<Record<string, unknown>> | undefined,
): SalesMaterialSessionConfig | null {
  const raw = metadata?.salesMaterial;
  if (!raw || typeof raw !== "object") return null;
  return raw as SalesMaterialSessionConfig;
}

export function readSalesCostMode(
  metadata: Readonly<Record<string, unknown>> | undefined,
): SalesCostMode | undefined {
  return readSalesMaterialConfig(metadata)?.costMode;
}

/** Build metadata payload for orchestration requests. */
export function buildSalesMaterialMetadata(
  config: SalesMaterialSessionConfig,
): Record<string, unknown> {
  return { salesMaterial: config };
}
