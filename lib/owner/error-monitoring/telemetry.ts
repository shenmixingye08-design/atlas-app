import OpenAI from "openai";

import { notifyOwnerExternalApiError } from "@/lib/notifications/emitters";

import { recordOwnerError } from "./store";
import type { ErrorCategoryId } from "./types";
import { recordServiceHealthFromErrorCategory } from "@/lib/owner/system-status/telemetry";
import { recordMonitoringIncident } from "@/lib/owner/monitoring/incidents";
import type { MonitorTargetId } from "@/lib/owner/monitoring/types";

function mapCategoryToIncident(categoryId: ErrorCategoryId): {
  kind: string;
  targetId: MonitorTargetId | "api";
} {
  switch (categoryId) {
    case "openai":
      return { kind: "openai_failure", targetId: "openai" };
    case "stripe":
      return { kind: "stripe_failure", targetId: "stripe" };
    case "google_auth":
      return { kind: "google_failure", targetId: "google" };
    case "dropbox_auth":
      return { kind: "dropbox_failure", targetId: "dropbox" };
    case "webhook":
      return { kind: "api_500", targetId: "billing" };
    default:
      return { kind: "api_500", targetId: "api" };
  }
}

function recordError(input: {
  categoryId: ErrorCategoryId;
  message: string;
  source?: string;
}): void {
  recordOwnerError(input);
  recordServiceHealthFromErrorCategory(input.categoryId, input.source);

  const serviceLabel =
    input.categoryId === "google_auth"
      ? "Google"
      : input.categoryId === "dropbox_auth"
        ? "Dropbox"
        : input.categoryId === "x_post"
          ? "X"
          : input.categoryId === "openai"
            ? "OpenAI"
            : input.categoryId === "stripe"
              ? "Stripe"
              : "External";

  notifyOwnerExternalApiError(serviceLabel, input.message);

  const mapped = mapCategoryToIncident(input.categoryId);
  recordMonitoringIncident({
    kind: mapped.kind,
    targetId: mapped.targetId,
    message: input.message,
    // Owner already notified via notifyOwnerExternalApiError above.
    critical: false,
    source: input.source,
  });
}

export function recordGoogleAuthFailure(
  message: string,
  source = "google_oauth",
): void {
  recordError({
    categoryId: "google_auth",
    message,
    source,
  });
}

export function recordDropboxAuthFailure(
  message: string,
  source = "dropbox_oauth",
): void {
  recordError({
    categoryId: "dropbox_auth",
    message,
    source,
  });
}

export function recordXPostFailure(message: string, source = "x_post"): void {
  recordError({
    categoryId: "x_post",
    message,
    source,
  });
}

export function recordXAuthFailure(message: string, source = "x_oauth"): void {
  recordError({
    categoryId: "x_post",
    message,
    source,
  });
}

export function recordWebhookFailure(message: string, source = "webhook"): void {
  recordError({
    categoryId: "webhook",
    message,
    source,
  });
}

export function recordOpenAiFailure(message: string, source = "openai"): void {
  recordError({
    categoryId: "openai",
    message,
    source,
  });
}

export function recordStripeFailure(message: string, source = "stripe"): void {
  recordError({
    categoryId: "stripe",
    message,
    source,
  });
}

export function recordOwnerErrorFromUnknown(
  categoryId: ErrorCategoryId,
  error: unknown,
  source?: string,
): void {
  const message =
    error instanceof Error ? error.message : "Unknown error occurred";

  recordError({
    categoryId,
    message,
    source,
  });
}

export function isOpenAiRelatedError(error: unknown): boolean {
  if (error instanceof OpenAI.APIError) return true;

  if (error instanceof Error) {
    return (
      error.message.includes("OPENAI") ||
      error.message.includes("OpenAI") ||
      error.message.toLowerCase().includes("openai")
    );
  }

  return false;
}

export function recordOpenAiFailureIfApplicable(
  error: unknown,
  source: string,
): void {
  if (!isOpenAiRelatedError(error)) return;
  recordOwnerErrorFromUnknown("openai", error, source);
}
