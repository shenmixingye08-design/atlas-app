import "server-only";

import { recordGoogleAuthFailure } from "@/lib/owner/error-monitoring/telemetry";
import { clientSafeMessage } from "@/lib/security/client-safe-message";

import {
  driveErrorHttpStatus,
  driveFailurePayload,
  GoogleDriveApiError,
  logGoogleDriveDiagnostic,
} from "./errors";

export function respondGoogleDriveResult(result: {
  status: string;
  message?: string;
}): Response {
  if (result.status === "ready") {
    return Response.json(result);
  }
  return Response.json(result, {
    status: driveErrorHttpStatus(result.status),
  });
}

export function respondGoogleDriveCaught(
  error: unknown,
  fallback: string,
  telemetryKey: string,
): Response {
  if (error instanceof GoogleDriveApiError) {
    logGoogleDriveDiagnostic(error);
    recordGoogleAuthFailure(error.userMessage, telemetryKey);
    return Response.json(driveFailurePayload(error), {
      status: driveErrorHttpStatus(error.resultStatus),
    });
  }

  const message = clientSafeMessage(error, fallback);
  recordGoogleAuthFailure(message, telemetryKey);
  return Response.json(
    {
      status: "error",
      message,
      failedStage: "provider",
    },
    { status: 500 },
  );
}
