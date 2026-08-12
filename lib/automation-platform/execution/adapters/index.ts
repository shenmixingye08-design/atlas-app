import "server-only";

import { invokeDropboxAdapter } from "@/lib/automation-platform/execution/adapters/dropbox";
import { invokeGmailAdapter } from "@/lib/automation-platform/execution/adapters/gmail";
import { invokeGoogleCalendarAdapter } from "@/lib/automation-platform/execution/adapters/google-calendar";
import {
  configMissingInput,
  mapThrownProviderError,
} from "@/lib/automation-platform/execution/adapters/map-provider-status";
import type {
  ExternalAdapter,
  ExternalAdapterInput,
  WiredExternalAdapterId,
} from "@/lib/automation-platform/execution/adapters/types";
import { WIRED_EXTERNAL_ADAPTER_IDS } from "@/lib/automation-platform/execution/adapters/types";
import { invokeWordPressAdapter } from "@/lib/automation-platform/execution/adapters/wordpress";
import { invokeXPostAdapter } from "@/lib/automation-platform/execution/adapters/x-post";
import type { StepInvokeResult } from "@/lib/automation-platform/execution/step-invoker";

const ADAPTERS: Record<WiredExternalAdapterId, ExternalAdapter> = {
  google_gmail: invokeGmailAdapter,
  google_calendar: invokeGoogleCalendarAdapter,
  x: invokeXPostAdapter,
  wordpress: invokeWordPressAdapter,
  dropbox: invokeDropboxAdapter,
};

export function isWiredExternalAdapterId(
  adapterId: string | null,
): adapterId is WiredExternalAdapterId {
  return (
    typeof adapterId === "string" &&
    (WIRED_EXTERNAL_ADAPTER_IDS as readonly string[]).includes(adapterId)
  );
}

export async function invokeWiredExternalAdapter(input: {
  adapterId: string;
  service: string;
  adapterInput: ExternalAdapterInput;
  /** Pre-validated input failure (missing to/text/folder). */
  inputError?: StepInvokeResult | null;
}): Promise<StepInvokeResult> {
  if (input.inputError) return input.inputError;
  if (!isWiredExternalAdapterId(input.adapterId)) {
    return {
      ok: false,
      summary: `${input.service}の本番ライブ実行アダプタは未配線です`,
      artifacts: [],
      errorCode: "live_adapter_missing",
      errorMessage: `${input.service}_live_adapter_not_wired`,
      failedStage: "EXTERNAL_ADAPTER_RESOLUTION",
      retryable: false,
    };
  }

  try {
    return await ADAPTERS[input.adapterId](input.adapterInput);
  } catch (error) {
    return mapThrownProviderError(input.service, error);
  }
}

export { configMissingInput, WIRED_EXTERNAL_ADAPTER_IDS };
export type { ExternalAdapterInput, WiredExternalAdapterId };
