import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RetentionPreviewClient } from "@/components/retention/retention-preview-client";

export const metadata: Metadata = {
  title: "Retention Preview — MINERVOT",
};

export default function RetentionPreviewPage() {
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
  return <RetentionPreviewClient />;
}
