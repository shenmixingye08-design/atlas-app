import "server-only";

import { dropboxLiveAdapter } from "../adapters/dropbox-adapter";
import { gmailLiveAdapter } from "../adapters/gmail-adapter";
import { googleCalendarLiveAdapter } from "../adapters/google-calendar-adapter";
import { googleDriveLiveAdapter } from "../adapters/google-drive-adapter";
import { wordpressLiveAdapter } from "../adapters/wordpress-adapter";
import { xLiveAdapter } from "../adapters/x-adapter";
import { assertProductionDisallowsSandbox } from "../mode";
import type { AdapterRegistry } from "../types";
import { createAdapterRegistry } from "./create-registry";

/** Production-only Live adapters. Sandbox/mock/stub must never enter this list. */
export function createProductionAdapterRegistry(): AdapterRegistry {
  assertProductionDisallowsSandbox("production");
  return createAdapterRegistry("production", [
    googleDriveLiveAdapter,
    gmailLiveAdapter,
    googleCalendarLiveAdapter,
    dropboxLiveAdapter,
    wordpressLiveAdapter,
    xLiveAdapter,
  ]);
}
