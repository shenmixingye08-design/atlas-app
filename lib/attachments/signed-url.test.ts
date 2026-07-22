import { describe, expect, it } from "vitest";

import {
  createAttachmentSignedToken,
  verifyAttachmentSignedToken,
} from "./signed-url";

describe("attachment signed url tokens", () => {
  it("creates and verifies a valid token", () => {
    const { token } = createAttachmentSignedToken({
      id: "att-1",
      userId: "user-1",
      ttlSeconds: 60,
    });
    const verified = verifyAttachmentSignedToken(token);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.payload.id).toBe("att-1");
      expect(verified.payload.userId).toBe("user-1");
    }
  });

  it("rejects expired tokens", () => {
    const { token } = createAttachmentSignedToken({
      id: "att-1",
      userId: "user-1",
      ttlSeconds: -10,
    });
    const verified = verifyAttachmentSignedToken(token);
    expect(verified.ok).toBe(false);
    if (!verified.ok) {
      expect(verified.reason).toBe("expired");
    }
  });

  it("rejects tampered tokens", () => {
    const { token } = createAttachmentSignedToken({
      id: "att-1",
      userId: "user-1",
      ttlSeconds: 60,
    });
    const verified = verifyAttachmentSignedToken(`${token}x`);
    expect(verified.ok).toBe(false);
  });
});
