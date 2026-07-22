import { describe, expect, it } from "vitest";

import {
  buildAttachmentContentNote,
  buildAttachmentsMetadataPayload,
  isImageAttachment,
  readAvailableImageAttachments,
  resolveImageDetailLevel,
} from "@/lib/attachments/metadata";
import type { AttachmentMetadataItem } from "@/lib/attachments/types";

function imageItem(
  overrides: Partial<AttachmentMetadataItem> = {},
): AttachmentMetadataItem {
  return {
    name: "receipt.jpg",
    kind: "photo",
    mimeType: "image/jpeg",
    size: 1200,
    contentAvailable: true,
    storageId: "att_1",
    fetchFailed: false,
    ...overrides,
  };
}

describe("attachments metadata", () => {
  it("detects image attachments by mime and kind", () => {
    expect(isImageAttachment(imageItem())).toBe(true);
    expect(
      isImageAttachment(
        imageItem({ kind: "other", mimeType: null, name: "shot.PNG" }),
      ),
    ).toBe(true);
    expect(
      isImageAttachment({
        name: "notes.pdf",
        kind: "pdf",
        mimeType: "application/pdf",
        size: 10,
        contentAvailable: false,
      }),
    ).toBe(false);
  });

  it("only exposes available images for vision (capped)", () => {
    const meta = {
      attachments: [
        imageItem({ storageId: "a1", name: "1.jpg" }),
        imageItem({
          storageId: "a2",
          name: "2.jpg",
          contentAvailable: false,
        }),
        imageItem({ storageId: "a3", name: "3.jpg", fetchFailed: true }),
        imageItem({ storageId: "a4", name: "4.jpg" }),
        {
          name: "doc.pdf",
          kind: "pdf",
          mimeType: "application/pdf",
          size: 1,
          contentAvailable: false,
        },
      ],
    };

    const available = readAvailableImageAttachments(meta);
    expect(available.map((item) => item.name)).toEqual(["1.jpg", "4.jpg"]);
  });

  it("uses low detail in eco mode", () => {
    expect(
      resolveImageDetailLevel({
        costOptimization: { executionMode: "eco" },
      }),
    ).toBe("low");
    expect(resolveImageDetailLevel({})).toBe("auto");
  });

  it("shows failure note only when image fetch failed", () => {
    expect(buildAttachmentContentNote([imageItem()])).toBeNull();
    expect(
      buildAttachmentContentNote([
        imageItem({ fetchFailed: true, contentAvailable: false }),
      ]),
    ).toBe("画像の取得に失敗しました");

    const payload = buildAttachmentsMetadataPayload([
      imageItem({ fetchFailed: true, contentAvailable: false }),
    ]);
    expect(payload.attachmentContentNote).toBe("画像の取得に失敗しました");
  });
});
