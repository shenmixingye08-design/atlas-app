import type { ExternalServiceDefinition } from "../external-services/types";

import { GOOGLE_ACCOUNT_SCOPES } from "./config";

export const googleServiceDefinition: ExternalServiceDefinition = {
  serviceId: "google",
  serviceName: "Google",
  icon: "🔵",
  purposes: ["Gmail", "Calendar", "Drive"],
  plannedScopes: [...GOOGLE_ACCOUNT_SCOPES],
  plannedFeatures: [
    "Gmail（メール取得）",
    "Calendar（予定取得）",
    "Drive（ファイル取得）",
  ],
};
