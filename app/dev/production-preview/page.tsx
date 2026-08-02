import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductionReadinessPanel } from "@/components/owner/production-readiness-panel";
import { getProductionOpsDashboard } from "@/lib/production/dashboard";

export const metadata: Metadata = {
  title: "Production Preview — MINERVOT",
};

export const dynamic = "force-dynamic";

export default async function ProductionPreviewPage() {
  const screenshotMode =
    process.env.ATLAS_SCREENSHOT_MODE === "1" ||
    process.env.ATLAS_SCREENSHOT_MODE === "true";
  if (
    process.env.NODE_ENV === "production" &&
    process.env.VERCEL_ENV === "production" &&
    !screenshotMode
  ) {
    notFound();
  }
  if (process.env.NODE_ENV === "production" && !screenshotMode && process.env.VERCEL) {
    notFound();
  }

  const snapshot = await getProductionOpsDashboard();
  return (
    <div className="min-h-[100dvh] bg-[var(--background)] p-4 sm:p-8">
      <div className="mx-auto max-w-5xl">
        <ProductionReadinessPanel initialData={snapshot} />
      </div>
    </div>
  );
}
