"use client";

import type { IntegrationUploadSummary } from "@/lib/integrations/types";
import { ui } from "@/lib/i18n";

type GoogleDriveUploadPanelProps = {
  uploads: IntegrationUploadSummary | null | undefined;
};

export function GoogleDriveUploadPanel({
  uploads,
}: GoogleDriveUploadPanelProps) {
  if (!uploads || uploads.provider !== "google_drive") {
    return null;
  }

  const primaryUrl =
    uploads.folderUrl ??
    uploads.uploads.find((item) => item.driveUrl)?.driveUrl ??
    null;

  const successCount = uploads.uploads.filter((item) => item.success).length;
  if (successCount === 0) return null;

  return (
    <p className="text-caption animate-fade-in">
      {ui.integrations.googleDriveUploaded}
      {primaryUrl && (
        <>
          {" · "}
          <a
            href={primaryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            {ui.actions.open}
          </a>
        </>
      )}
    </p>
  );
}
