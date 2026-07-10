"use client";

import type { DriveSaveResult } from "@/lib/integrations/google/drive/types";

export type DriveBackupUploadResult =
  | Extract<DriveSaveResult, { status: "ready" }>
  | { status: "google_not_connected" | "feature_disabled" | "error"; message: string };

export async function uploadBackupToDriveClient(input: {
  fileName: string;
  base64: string;
  mimeType: string;
}): Promise<DriveBackupUploadResult> {
  const response = await fetch("/api/data-export/drive-backup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const body = (await response.json()) as DriveBackupUploadResult;

  if (!response.ok) {
    if (
      body.status === "google_not_connected" ||
      body.status === "feature_disabled"
    ) {
      return body;
    }
    return {
      status: "error",
      message: "message" in body ? body.message : "Drive backup failed",
    };
  }

  return body;
}
