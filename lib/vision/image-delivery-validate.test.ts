import { describe, expect, it } from "vitest";

import {
  assertImageDeliveryOrThrow,
  validateImageDelivery,
} from "@/lib/vision/image-delivery-validate";

describe("validateImageDelivery", () => {
  it("flags 0-byte images", () => {
    const check = validateImageDelivery({
      mimeType: "image/jpeg",
      byteSize: 0,
      deliveryMethod: "base64",
    });
    expect(check.ok).toBe(false);
    expect(check.issues).toContain("empty_file");
    expect(() => assertImageDeliveryOrThrow(check)).toThrowError(
      expect.objectContaining({ code: "empty_image" }),
    );
  });

  it("flags invalid MIME", () => {
    const check = validateImageDelivery({
      mimeType: "application/pdf",
      byteSize: 1000,
      deliveryMethod: "base64",
    });
    expect(check.issues).toContain("invalid_mime");
    expect(() => assertImageDeliveryOrThrow(check)).toThrowError(
      expect.objectContaining({ code: "unsupported_type" }),
    );
  });

  it("flags expired signed URLs", () => {
    const check = validateImageDelivery({
      mimeType: "image/jpeg",
      byteSize: 1000,
      deliveryMethod: "url",
      imageUrl:
        "https://example.supabase.co/storage/v1/object/sign/x.jpg?X-Amz-Date=20200101T000000Z&X-Amz-Expires=60",
    });
    expect(check.issues).toContain("signed_url_expired");
    expect(() => assertImageDeliveryOrThrow(check)).toThrowError(
      expect.objectContaining({ code: "storage_failed" }),
    );
  });

  it("flags truncated base64", () => {
    const check = validateImageDelivery({
      mimeType: "image/jpeg",
      byteSize: 10_000,
      deliveryMethod: "base64",
      base64Length: 100,
    });
    expect(check.issues).toContain("base64_truncated");
  });

  it("accepts healthy jpeg base64 metrics", () => {
    const byteSize = 1200;
    const base64Length = Buffer.alloc(byteSize).toString("base64").length;
    const check = validateImageDelivery({
      mimeType: "image/jpeg",
      byteSize,
      deliveryMethod: "base64",
      base64Length,
    });
    expect(check.ok).toBe(true);
  });
});
