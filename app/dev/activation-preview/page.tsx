import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ActivationPreviewClient } from "@/components/activation/activation-preview-client";

export const metadata: Metadata = {
  title: "Activation Preview — MINERVOT",
};

export default function ActivationPreviewPage() {
  const screenshotMode =
    process.env.ATLAS_SCREENSHOT_MODE === "1" ||
    process.env.ATLAS_SCREENSHOT_MODE === "true";
  // Hidden in real production deploys; allow local `next start` screenshot runs.
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
  return <ActivationPreviewClient />;
}
