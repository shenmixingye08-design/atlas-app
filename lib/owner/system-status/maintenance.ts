export type MaintenanceModeConfig = {
  enabled: boolean;
  message: string;
  /** ISO 8601 — displayed as recovery estimate */
  estimatedRecoveryAt: string | null;
  announcement: string;
  updatedAt: string;
};

const DEFAULT_MAINTENANCE: MaintenanceModeConfig = {
  enabled: false,
  message: "現在メンテナンス中です。ご不便をおかけして申し訳ありません。",
  estimatedRecoveryAt: null,
  announcement: "",
  updatedAt: new Date(0).toISOString(),
};

function getMaintenanceBucket(): MaintenanceModeConfig {
  const globalScope = globalThis as typeof globalThis & {
    __atlasMaintenanceMode?: MaintenanceModeConfig;
  };

  if (!globalScope.__atlasMaintenanceMode) {
    globalScope.__atlasMaintenanceMode = { ...DEFAULT_MAINTENANCE };
  }

  return globalScope.__atlasMaintenanceMode;
}

export function getMaintenanceModeConfig(): MaintenanceModeConfig {
  return { ...getMaintenanceBucket() };
}

export function setMaintenanceModeConfig(
  patch: Partial<Omit<MaintenanceModeConfig, "updatedAt">>,
): MaintenanceModeConfig {
  const current = getMaintenanceBucket();
  const next: MaintenanceModeConfig = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  Object.assign(getMaintenanceBucket(), next);
  return { ...next };
}

export function resetMaintenanceModeConfig(): void {
  Object.assign(getMaintenanceBucket(), {
    ...DEFAULT_MAINTENANCE,
    updatedAt: new Date().toISOString(),
  });
}

export function parseMaintenancePatchBody(body: unknown):
  | Partial<Omit<MaintenanceModeConfig, "updatedAt">>
  | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Request body must be an object" };
  }

  const record = body as Record<string, unknown>;
  const patch: Partial<Omit<MaintenanceModeConfig, "updatedAt">> = {};

  if ("enabled" in record) {
    if (typeof record.enabled !== "boolean") {
      return { error: "enabled must be a boolean" };
    }
    patch.enabled = record.enabled;
  }

  if ("message" in record) {
    if (typeof record.message !== "string") {
      return { error: "message must be a string" };
    }
    patch.message = record.message.trim();
  }

  if ("announcement" in record) {
    if (typeof record.announcement !== "string") {
      return { error: "announcement must be a string" };
    }
    patch.announcement = record.announcement.trim();
  }

  if ("estimatedRecoveryAt" in record) {
    if (record.estimatedRecoveryAt === null) {
      patch.estimatedRecoveryAt = null;
    } else if (typeof record.estimatedRecoveryAt === "string") {
      patch.estimatedRecoveryAt = record.estimatedRecoveryAt;
    } else {
      return { error: "estimatedRecoveryAt must be a string or null" };
    }
  }

  if (Object.keys(patch).length === 0) {
    return { error: "No valid fields to update" };
  }

  return patch;
}
