import { resetNotificationStore } from "@/lib/notifications/store";

import type { BillingNotificationRecord } from "./types";

type NotificationBucket = BillingNotificationRecord[];

function getBucket(): NotificationBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasBillingNotificationStore?: NotificationBucket;
  };

  if (!globalScope.__atlasBillingNotificationStore) {
    globalScope.__atlasBillingNotificationStore = [];
  }

  return globalScope.__atlasBillingNotificationStore;
}

export function appendBillingNotification(
  record: BillingNotificationRecord,
): BillingNotificationRecord {
  getBucket().unshift(record);
  if (getBucket().length > 200) {
    getBucket().length = 200;
  }
  return record;
}

export function listBillingNotifications(filter?: {
  audience?: BillingNotificationRecord["audience"];
  userId?: string;
}): BillingNotificationRecord[] {
  return getBucket().filter((record) => {
    if (filter?.audience && record.audience !== filter.audience) {
      return false;
    }
    if (filter?.userId && record.userId !== filter.userId) {
      return false;
    }
    return true;
  });
}

export function resetBillingNotificationStore(): void {
  getBucket().length = 0;
  resetNotificationStore();
}
