import { describe, expect, it } from "vitest";

import type { StoredDeliverable } from "@/lib/deliverables/store";

import { projectFromStoredWordFile } from "./resolve-deliverable-lookup";

describe("projectFromStoredWordFile", () => {
  it("recovers a ready Project so /results can show download after Word UUID notify", () => {
    const file = {
      id: "c4ac3465-532b-4106-9513-b1ef5346020a",
      format: "docx",
      fileName: "営業報告書.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: Buffer.from("PK\x03\x04"),
      isPlaceholder: false,
      generatedAt: "2026-07-28T00:00:00.000Z",
      userId: "user_1",
      sourceContent: "# 営業報告書\n\n本文です。",
      baseFileName: "営業報告書",
    } satisfies StoredDeliverable;

    const project = projectFromStoredWordFile(file, `wordfile-${file.id}`);
    expect(project.id).toBe(`wordfile-${file.id}`);
    expect(project.status).toBe("completed");
    expect(project.result?.status).toBe("completed");
    expect(project.result?.fileDeliverables?.[0]?.id).toBe(file.id);
    expect(project.result?.fileDeliverables?.[0]?.downloadUrl).toContain(
      file.id,
    );
    expect(project.result?.deliverable.content).toContain("営業報告書");
  });
});
