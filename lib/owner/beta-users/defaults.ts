export const ESTIMATED_TOTAL_USERS = 360;
export const ESTIMATED_BETA_PARTICIPANTS = 12;

export function buildEstimatedBetaUserMetrics(): {
  betaParticipantCount: number;
  totalUserCount: number;
  generalUserCount: number;
  participationRatePercent: number;
} {
  const betaParticipantCount = ESTIMATED_BETA_PARTICIPANTS;
  const totalUserCount = ESTIMATED_TOTAL_USERS;
  const generalUserCount = Math.max(0, totalUserCount - betaParticipantCount);
  const participationRatePercent =
    totalUserCount > 0
      ? Math.round((betaParticipantCount / totalUserCount) * 1000) / 10
      : 0;

  return {
    betaParticipantCount,
    totalUserCount,
    generalUserCount,
    participationRatePercent,
  };
}
