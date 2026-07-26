import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEYS = [
  "VAPID_PUBLIC_KEY",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
] as const;

describe("vapid config status", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const key of KEYS) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of KEYS) {
      delete process.env[key];
    }
  });

  it("reports missing public key when neither public env is set", async () => {
    process.env.VAPID_PRIVATE_KEY = "private";
    process.env.VAPID_SUBJECT = "mailto:ops@example.com";
    const { getVapidConfigStatus, getVapidPublicKey } = await import("./vapid");
    const status = getVapidConfigStatus();
    expect(getVapidPublicKey()).toBeNull();
    expect(status.hasPublicKey).toBe(false);
    expect(status.errorCode).toBe("vapid_public_key_missing");
    expect(status.configured).toBe(false);
  });

  it("accepts NEXT_PUBLIC_VAPID_PUBLIC_KEY as public key source", async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public-from-next";
    process.env.VAPID_PRIVATE_KEY = "private";
    process.env.VAPID_SUBJECT = "ops@example.com";
    const { getVapidConfigStatus, getVapidPublicKey, getVapidSubject } =
      await import("./vapid");
    expect(getVapidPublicKey()).toBe("public-from-next");
    expect(getVapidConfigStatus().configured).toBe(true);
    expect(getVapidSubject()).toBe("mailto:ops@example.com");
  });

  it("prefers VAPID_PUBLIC_KEY over NEXT_PUBLIC_", async () => {
    process.env.VAPID_PUBLIC_KEY = "server-public";
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "client-public";
    const { getVapidPublicKey } = await import("./vapid");
    expect(getVapidPublicKey()).toBe("server-public");
  });
});
