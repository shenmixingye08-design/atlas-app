import { createHash } from "crypto";

import { getContactCategoryLabel } from "./categories";
import { saveContactRecord } from "./store";
import type { ContactDispatcher, ContactRecord } from "./types";

function emailFingerprint(email: string): string {
  return createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex")
    .slice(0, 12);
}

/** Persists submissions in the in-memory store. */
export const storeContactDispatcher: ContactDispatcher = {
  name: "store",
  async dispatch(record) {
    saveContactRecord(record);
    return { channel: "store", ok: true };
  },
};

/** Structured server log for operations / future log drain. */
export const logContactDispatcher: ContactDispatcher = {
  name: "log",
  async dispatch(record) {
    // P0-04: never log raw email / subject / message body (client-safe module).
    console.info("[ATLAS contact]", {
      id: record.id,
      category: getContactCategoryLabel(record.category),
      emailFingerprint: emailFingerprint(record.email),
      subjectLength: record.subject?.length ?? 0,
      createdAt: record.createdAt,
    });
    return { channel: "log", ok: true };
  },
};

/**
 * Default dispatch pipeline.
 * Add email / Slack / LINE dispatchers here when ready.
 */
export const contactDispatchers: ContactDispatcher[] = [
  storeContactDispatcher,
  logContactDispatcher,
];

export async function dispatchContactRecord(
  record: ContactRecord,
): Promise<void> {
  await Promise.all(
    contactDispatchers.map(async (dispatcher) => {
      try {
        await dispatcher.dispatch(record);
      } catch (error) {
        console.error(`[ATLAS contact] ${dispatcher.name} dispatch failed`, {
          name: error instanceof Error ? error.name : typeof error,
        });
      }
    }),
  );
}
