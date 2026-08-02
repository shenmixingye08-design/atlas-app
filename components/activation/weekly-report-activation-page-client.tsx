"use client";

import { useRouter } from "next/navigation";

import { WeeklyReportActivation } from "@/components/activation/weekly-report-activation";
import { ATLAS_APP_HOME_PATH } from "@/lib/auth/public-routes";

export function WeeklyReportActivationPageClient() {
  const router = useRouter();

  return (
    <WeeklyReportActivation
      embedded
      onComplete={() => {
        router.replace(ATLAS_APP_HOME_PATH);
      }}
      onSkip={() => {
        router.replace(ATLAS_APP_HOME_PATH);
      }}
    />
  );
}
