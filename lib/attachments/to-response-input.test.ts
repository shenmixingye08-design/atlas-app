import { afterEach, describe, expect, it } from "vitest";

import { buildMultimodalResponseInput } from "@/lib/attachments/to-response-input";
import {
  clearAttachmentStore,
  saveAttachment,
} from "@/lib/attachments/store";

afterEach(() => {
  clearAttachmentStore();
});

describe("buildMultimodalResponseInput", () => {
  it("returns plain text when no images are available", () => {
    const input = buildMultimodalResponseInput("hello", {
      attachments: [
        {
          name: "a.pdf",
          kind: "pdf",
          mimeType: "application/pdf",
          size: 10,
          contentAvailable: false,
        },
      ],
    });
    expect(input).toBe("hello");
  });

  it("attaches stored image bytes as input_image data URLs", () => {
    const stored = saveAttachment({
      fileName: "card.png",
      mimeType: "image/png",
      kind: "photo",
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      userId: "user_1",
    });

    const input = buildMultimodalResponseInput("名刺を登録して", {
      attachments: [
        {
          name: "card.png",
          kind: "photo",
          mimeType: "image/png",
          size: 4,
          contentAvailable: true,
          storageId: stored.id,
        },
      ],
    });

    expect(Array.isArray(input)).toBe(true);
    const message = (input as unknown as Array<Record<string, unknown>>)[0]!;
    expect(message.role).toBe("user");
    const content = message.content as Array<Record<string, unknown>>;
    expect(content[0]).toEqual({ type: "input_text", text: "名刺を登録して" });
    expect(content[1]?.type).toBe("input_image");
    expect(content[1]?.detail).toBe("auto");
    expect(String(content[1]?.image_url)).toMatch(/^data:image\/png;base64,/);
  });

  it("uses low detail when cost optimization is eco", () => {
    const stored = saveAttachment({
      fileName: "r.jpg",
      mimeType: "image/jpeg",
      kind: "photo",
      buffer: Buffer.from("abc"),
    });

    const input = buildMultimodalResponseInput("解析して", {
      costOptimization: { executionMode: "eco" },
      attachments: [
        {
          name: "r.jpg",
          kind: "photo",
          mimeType: "image/jpeg",
          size: 3,
          contentAvailable: true,
          storageId: stored.id,
        },
      ],
    });

    const content = (input as Array<{ content: Array<{ detail?: string }> }>)[0]!
      .content;
    expect(content[1]?.detail).toBe("low");
  });
});
