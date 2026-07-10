import type { ErrorCategoryId } from "@/lib/owner/error-monitoring/types";

import { mapErrorCategoryToSystemService } from "./registry";
import { recordHealthProbe } from "./store";
import type { SystemServiceId } from "./types";

export function recordServiceHealthSuccess(
  serviceId: SystemServiceId,
  source = "health_check",
): void {
  recordHealthProbe({ serviceId, success: true, source });
}

export function recordServiceHealthFailure(
  serviceId: SystemServiceId,
  source = "health_check",
): void {
  recordHealthProbe({ serviceId, success: false, source });
}

export function recordServiceHealthFromErrorCategory(
  categoryId: ErrorCategoryId,
  source?: string,
): void {
  const serviceId = mapErrorCategoryToSystemService(categoryId);
  if (!serviceId) return;

  recordHealthProbe({
    serviceId,
    success: false,
    source: source ?? categoryId,
  });
}
