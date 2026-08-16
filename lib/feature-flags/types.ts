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
  | "high_quality_mode"
  | "automation_v2_enabled"
  | "automation_memory_enabled"
  | "automation_approval_enabled"
  | "automation_first_home_enabled"
  | "automation_first_navigation_enabled"
  | "automation_design_system_enabled"
  | "automation_dashboard_v2_enabled"
  | "workflow_learning_enabled"
  | "automation_operations_enabled";

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

export type FeatureFlagPersistMode = "durable" | "memory" | "blocked";

export type FeatureFlagSnapshot = {
  flags: FeatureFlagRecord[];
  updatedAt: string;
  persistMode?: FeatureFlagPersistMode;
  mutable?: boolean;
  hydrateFailed?: boolean;
};

/** Per-user availability — exposed to clients, not admin states. */
export type FeatureAvailabilityMap = Record<FeatureFlagId, boolean>;

export type FeatureAccessContext = {
  email: string | null;
  isOwner: boolean;
  isBetaUser: boolean;
};
