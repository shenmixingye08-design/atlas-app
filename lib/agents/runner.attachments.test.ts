import { afterEach, describe, expect, it } from "vitest";

import { buildAgentResponseInput } from "@/lib/agents/runner";
import {
  clearAttachmentStore,
  saveAttachment,
} from "@/lib/attachments/store";

afterEach(() => {
  clearAttachmentStore();
});

describe("buildAgentResponseInput", () => {
  it("keeps string input without attachments", () => {
    const input = buildAgentResponseInput("Write a summary", {
      assignment: "Summarize the meeting",
    });
    expect(typeof input).toBe("string");
    expect(input).toContain("Original Assignment");
    expect(input).toContain("Write a summary");
  });

  it("includes input_image when metadata references stored images", () => {
    const stored = saveAttachment({
      fileName: "site.jpg",
      mimeType: "image/jpeg",
      kind: "photo",
      buffer: Buffer.from("jpeg-bytes"),
    });

    const input = buildAgentResponseInput("Create a report", {
      assignment: "現場写真から報告書を作成",
      metadata: {
        attachments: [
          {
            name: "site.jpg",
            kind: "photo",
            mimeType: "image/jpeg",
            size: 10,
            contentAvailable: true,
            storageId: stored.id,
          },
        ],
      },
    });

    expect(Array.isArray(input)).toBe(true);
    const content = (input as Array<{ content: Array<{ type: string }> }>)[0]!
      .content;
    expect(content.some((part) => part.type === "input_image")).toBe(true);
    expect(content.some((part) => part.type === "input_text")).toBe(true);
  });
});
