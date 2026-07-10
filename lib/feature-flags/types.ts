/** Managed feature identifiers for gradual rollout. */
export type FeatureFlagId =
  | "google"
  | "x"
  | "wordpress"
  | "dropbox"
  | "video_generation"
  | "image_generation"
  | "sales_material"
  | "blog"
  | "sns"
  | "ai_employees"
  | "high_quality_mode";

/** Operator-controlled rollout state. */
export type FeatureFlagState = "on" | "off" | "beta";

export type FeatureFlagDefinition = {
  id: FeatureFlagId;
  label: string;
  description: string;
  category: "integration" | "capability";
};

export type FeatureFlagRecord = {
  id: FeatureFlagId;
  state: FeatureFlagState;
  updatedAt: string;
};

export type FeatureFlagSnapshot = {
  flags: FeatureFlagRecord[];
  updatedAt: string;
};

/** Per-user availability — exposed to clients, not admin states. */
export type FeatureAvailabilityMap = Record<FeatureFlagId, boolean>;

export type FeatureAccessContext = {
  email: string | null;
  isOwner: boolean;
  isBetaUser: boolean;
};
