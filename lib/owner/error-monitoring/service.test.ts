import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildErrorMonitoringSnapshot } from "./service";
import {
  recordOwnerError,
  resetErrorMonitoringStore,
  setErrorCategoryResolution,
} from "./store";

describe("error monitoring store", () => {
  beforeEach(() => {
    resetErrorMonitoringStore();
  });

  afterEach(() => {
    resetErrorMonitoringStore();
  });

  it("records errors and marks category open", () => {
    recordOwnerError({
      categoryId: "google_auth",
      message: "OAuth state expired",
      source: "test",
    });

    const snapshot = buildErrorMonitoringSnapshot();
    const google = snapshot.categories.find(
      (category) => category.categoryId === "google_auth",
    );

    expect(google?.occurrenceCount).toBe(1);
    expect(google?.resolutionStatus).toBe("open");
    expect(google?.lastMessage).toBe("OAuth state expired");
    expect(google?.lastOccurredAt).toBeTruthy();
  });

  it("tracks open count across categories", () => {
    recordOwnerError({ categoryId: "openai", message: "Rate limit" });
    recordOwnerError({ categoryId: "stripe", message: "Webhook signature invalid" });

    const snapshot = buildErrorMonitoringSnapshot();
    expect(snapshot.openCount).toBe(2);
  });

  it("allows resolving a category", () => {
    recordOwnerError({ categoryId: "webhook", message: "Payload invalid" });
    setErrorCategoryResolution("webhook", "resolved");

    const snapshot = buildErrorMonitoringSnapshot();
    const webhook = snapshot.categories.find(
      (category) => category.categoryId === "webhook",
    );

    expect(webhook?.resolutionStatus).toBe("resolved");
    expect(webhook?.resolvedAt).toBeTruthy();
  });

  it("reopens when a new error occurs after resolve", () => {
    recordOwnerError({ categoryId: "x_post", message: "First failure" });
    setErrorCategoryResolution("x_post", "resolved");
    recordOwnerError({ categoryId: "x_post", message: "Second failure" });

    const snapshot = buildErrorMonitoringSnapshot();
    const xPost = snapshot.categories.find(
      (category) => category.categoryId === "x_post",
    );

    expect(xPost?.occurrenceCount).toBe(2);
    expect(xPost?.resolutionStatus).toBe("open");
    expect(xPost?.lastMessage).toBe("Second failure");
  });
});
