import { describe, expect, it } from "vitest";

import {
  AttachmentStorageError,
  classifySupabaseError,
  sanitizeProviderMessage,
} from "@/lib/attachments/errors";

describe("attachment errors", () => {
  it("classifies missing table", () => {
    const err = classifySupabaseError(
      {
        code: "PGRST205",
        message: "Could not find the table 'public.atlas_image_attachments' in the schema cache",
      },
      "db.insert",
    );
    expect(err).toBeInstanceOf(AttachmentStorageError);
    expect(err.code).toBe("table_missing");
    expect(err.message).toContain("migration");
  });

  it("classifies missing bucket", () => {
    const err = classifySupabaseError(
      { message: "Bucket not found", status: 404 },
      "storage.upload.original",
    );
    expect(err.code).toBe("bucket_missing");
  });

  it("redacts jwt-like strings", () => {
    const cleaned = sanitizeProviderMessage(
      "token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb leaked",
    );
    expect(cleaned).toContain("[redacted_jwt]");
    expect(cleaned).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
  });
});
