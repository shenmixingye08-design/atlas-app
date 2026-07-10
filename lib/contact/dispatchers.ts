import { getContactCategoryLabel } from "./categories";
import { saveContactRecord } from "./store";
import type { ContactDispatcher, ContactRecord } from "./types";

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
    console.info("[ATLAS contact]", {
      id: record.id,
      category: getContactCategoryLabel(record.category),
      email: record.email,
      subject: record.subject,
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
        console.error(`[ATLAS contact] ${dispatcher.name} dispatch failed`, error);
      }
    }),
  );
}
