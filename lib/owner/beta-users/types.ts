export type BetaUserSource = "env" | "runtime";

export type BetaUserEntry = {
  email: string;
  source: BetaUserSource;
};

export type BetaFeatureEntry = {
  featureId: string;
  label: string;
  category: "integration" | "capability";
};

export type BetaUserManagementSnapshot = {
  betaParticipantCount: number;
  generalUserCount: number;
  totalUserCount: number;
  participationRatePercent: number | null;
  betaFeatures: readonly BetaFeatureEntry[];
  betaUsers: readonly BetaUserEntry[];
  isEstimated: boolean;
  generatedAt: string;
};

export type BetaUserPatchAction = "add" | "remove";
