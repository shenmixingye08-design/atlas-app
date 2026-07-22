import { describe, expect, it } from "vitest";

import {
  assertDeliverableDownloadAccess,
  assertDocumentModelAccess,
  isResourceOwnedByUser,
} from "./resource-ownership";
import { saveDeliverableFile } from "@/lib/deliverables/store";
import { DOCUMENT_MODEL_SCHEMA_VERSION } from "@/lib/documents/schema/enums";
import { saveDocumentModel } from "@/lib/documents/storage/document-store";

describe("resource ownership guards", () => {
  it("denies cross-user deliverable download", () => {
    const stored = saveDeliverableFile({
      format: "pdf",
      fileName: "report.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("pdf-bytes"),
      isPlaceholder: false,
      userId: "user_a",
    });

    const denied = assertDeliverableDownloadAccess({
      deliverableId: stored.id,
      userId: "user_b",
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.status).toBe(403);

    const allowed = assertDeliverableDownloadAccess({
      deliverableId: stored.id,
      userId: "user_a",
    });
    expect(allowed.ok).toBe(true);
  });

  it("rejects zero-byte deliverables", () => {
    const stored = saveDeliverableFile({
      format: "pdf",
      fileName: "empty.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.alloc(0),
      isPlaceholder: false,
      validationPassed: false,
      userId: "user_a",
    });

    const result = assertDeliverableDownloadAccess({
      deliverableId: stored.id,
      userId: "user_a",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(422);
  });

  it("denies cross-user document model access", () => {
    const model = saveDocumentModel({
      model: {
        schemaVersion: DOCUMENT_MODEL_SCHEMA_VERSION,
        documentType: "report",
        templateId: "generic",
        title: "Test",
        sections: [],
      },
      userId: "user_a",
    });

    expect(
      assertDocumentModelAccess({ documentModelId: model.id, userId: "user_b" }).ok,
    ).toBe(false);
    expect(
      assertDocumentModelAccess({ documentModelId: model.id, userId: "user_a" }).ok,
    ).toBe(true);
  });

  it("allows legacy rows without owner userId", () => {
    expect(isResourceOwnedByUser(null, "any_user")).toBe(true);
  });
});
