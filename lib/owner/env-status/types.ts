export type EnvServiceId =
  | "openai"
  | "clerk"
  | "stripe"
  | "supabase"
  | "google"
  | "dropbox"
  | "line"
  | "vercel_cron"
  | "atlas";

export type EnvRequirement = "required" | "recommended" | "optional";

export type OwnerEnvVarDefinition = {
  key: string;
  service: EnvServiceId;
  requirement: EnvRequirement;
  /** Human-readable purpose (Japanese). */
  purpose: string;
  /** Alternate keys that also satisfy this slot (OR). */
  aliases?: readonly string[];
};

export type OwnerEnvVarStatus = {
  key: string;
  service: EnvServiceId;
  serviceLabel: string;
  requirement: EnvRequirement;
  purpose: string;
  /** true = set (value never returned). */
  configured: boolean;
  /** Masked display only. */
  displayValue: "******" | "（未設定）";
};

export type OwnerEnvStatusSnapshot = {
  generatedAt: string;
  summary: {
    total: number;
    configured: number;
    missing: number;
    requiredMissing: number;
  };
  variables: OwnerEnvVarStatus[];
};
