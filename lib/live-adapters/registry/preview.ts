import "server-only";

import { dropboxLiveAdapter } from "../adapters/dropbox-adapter";
import { gmailLiveAdapter } from "../adapters/gmail-adapter";
import { googleCalendarLiveAdapter } from "../adapters/google-calendar-adapter";
import { googleDriveLiveAdapter } from "../adapters/google-drive-adapter";
import { wordpressLiveAdapter } from "../adapters/wordpress-adapter";
import { xLiveAdapter } from "../adapters/x-adapter";
import type { AdapterRegistry } from "../types";
import { createAdapterRegistry } from "./create-registry";

/**
 * Preview registry uses the same Live adapter implementations.
 * Side-effects still require ATLAS_PREVIEW_LIVE_EXTERNAL / AUTOMATION_E2E_LIVE_EXTERNAL.
 * Fake draft success is never registered here.
 */
export function createPreviewAdapterRegistry(): AdapterRegistry {
  return createAdapterRegistry("preview", [
    googleDriveLiveAdapter,
    gmailLiveAdapter,
    googleCalendarLiveAdapter,
    dropboxLiveAdapter,
    wordpressLiveAdapter,
    xLiveAdapter,
  ]);
}
