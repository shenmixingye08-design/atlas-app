import "server-only";

import { isFeatureEnabled } from "@/lib/feature-flags/access";
import type { FeatureAccessContext } from "@/lib/feature-flags/types";
import { featureDisabledMessage } from "@/lib/feature-flags/guards";
import { getExternalServiceConnection } from "@/lib/integrations/external-services/store";
import { getGoogleAccountAccessToken } from "@/lib/integrations/google/token-manager";

import { fetchGmailMessage, fetchGmailMessages } from "./api-client";
import { isGmailFilterId, resolveGmailSearchQuery } from "./filters";
import type {
  GmailFilterId,
  GmailMessagesResult,
  GmailMessagesSnapshot,
} from "./types";

export async function getGmailMessagesForUser(input: {
  userId: string;
  filter: GmailFilterId;
  context: FeatureAccessContext;
  now?: Date;
}): Promise<GmailMessagesResult> {
  if (!isFeatureEnabled("google", input.context)) {
    return {
      status: "feature_disabled",
      message: featureDisabledMessage("google"),
    };
  }

  const connection = getExternalServiceConnection(input.userId, "google");
  if (connection.status !== "connected") {
    return {
      status: "google_not_connected",
      message: "Googleを接続してください",
    };
  }

  const accessToken = await getGoogleAccountAccessToken(input.userId);
  if (!accessToken) {
    return {
      status: "google_not_connected",
      message: "Googleを接続してください",
    };
  }

  const search = resolveGmailSearchQuery(input.filter, input.now);
  const messages = await fetchGmailMessages({
    accessToken,
    query: search.query,
  });

  const snapshot: GmailMessagesSnapshot = {
    filter: input.filter,
    filterLabel: search.label,
    messages,
    generatedAt: (input.now ?? new Date()).toISOString(),
  };

  return { status: "ready", snapshot };
}

export function parseGmailFilterParam(
  value: string | null,
): GmailFilterId | null {
  if (!value || !isGmailFilterId(value)) return null;
  return value;
}

export async function getGmailMessageForUser(input: {
  userId: string;
  messageId: string;
  context: FeatureAccessContext;
}): Promise<
  | { status: "ready"; message: import("./types").GmailMessage }
  | { status: Exclude<import("./types").GmailFetchStatus, "ready">; message: string }
  | { status: "not_found"; message: string }
> {
  if (!isFeatureEnabled("google", input.context)) {
    return {
      status: "feature_disabled",
      message: featureDisabledMessage("google"),
    };
  }

  const connection = getExternalServiceConnection(input.userId, "google");
  if (connection.status !== "connected") {
    return {
      status: "google_not_connected",
      message: "Googleを接続してください",
    };
  }

  const accessToken = await getGoogleAccountAccessToken(input.userId);
  if (!accessToken) {
    return {
      status: "google_not_connected",
      message: "Googleを接続してください",
    };
  }

  const message = await fetchGmailMessage({
    accessToken,
    messageId: input.messageId,
  });

  if (!message) {
    return { status: "not_found", message: "メールが見つかりません" };
  }

  return { status: "ready", message };
}
