import { readFileSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ClientImageUploadError,
  filterImageFiles,
  uploadImagesToAtlas,
} from "@/lib/attachments/client-upload";
import { filterDocumentFiles, uploadDocumentsToAtlas } from "@/lib/attachments/documents/client-upload";
import {
  assertDocumentBatchLimits,
  assertSupportedDocument,
  DocumentValidationError,
} from "@/lib/attachments/documents/security";
import {
  assertSupportedImage,
  ImageValidationError,
} from "@/lib/attachments/image-security";
import { ATTACHMENT_LIMITS } from "@/lib/attachments/types";

function makeFile(name: string, type: string, bytes = 128): File {
  const buffer = new Uint8Array(bytes);
  return new File([buffer], name, { type });
}

describe("attachment client flow", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("1. image attachment enters filtered file state", () => {
    const files = [
      makeFile("receipt.jpg", "image/jpeg"),
      makeFile("notes.txt", "text/plain"),
    ];
    const images = filterImageFiles(files);
    expect(images).toHaveLength(1);
    expect(images[0]?.name).toBe("receipt.jpg");
  });

  it("2. PDF attachment enters filtered document state", () => {
    const files = [
      makeFile("invoice.pdf", "application/pdf"),
      makeFile("malware.exe", "application/octet-stream"),
    ];
    const docs = filterDocumentFiles(files);
    expect(docs).toHaveLength(1);
    expect(docs[0]?.name).toBe("invoice.pdf");
  });

  it("3. file name is available for preview display", () => {
    const image = makeFile("看板写真.png", "image/png");
    const draft = {
      localId: "local_1",
      file: image,
      fileName: image.name,
      status: "pending" as const,
    };
    expect(draft.fileName).toBe("看板写真.png");
  });

  it("4. attachments can be removed from list state", () => {
    const list = [
      { id: "a", fileName: "a.jpg" },
      { id: "b", fileName: "b.pdf" },
    ];
    const next = list.filter((item) => item.id !== "a");
    expect(next).toEqual([{ id: "b", fileName: "b.pdf" }]);
  });

  it("5. image upload puts files into FormData", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const form = init?.body as FormData;
      expect(form).toBeInstanceOf(FormData);
      const entries = form.getAll("files");
      expect(entries).toHaveLength(1);
      expect((entries[0] as File).name).toBe("shot.jpg");
      return new Response(
        JSON.stringify({
          attachments: [
            {
              id: "att_1",
              fileName: "shot.jpg",
              mimeType: "image/jpeg",
              originalBytes: 128,
              processedBytes: 100,
              width: 10,
              height: 10,
              contentHash: "abc",
              warnings: [],
            },
          ],
          warnings: [],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadImagesToAtlas([makeFile("shot.jpg", "image/jpeg")]);
    expect(result.attachments[0]?.id).toBe("att_1");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/attachments/images",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("6. document upload API receives FormData files", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const form = init?.body as FormData;
      expect(form.getAll("files")).toHaveLength(1);
      return new Response(
        JSON.stringify({
          documents: [
            {
              id: "doc_1",
              fileName: "spec.pdf",
              mimeType: "application/pdf",
              bytes: 128,
              extractedText: "本文",
              pageOrSheetCount: 1,
              warnings: [],
            },
          ],
          warnings: [],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadDocumentsToAtlas([
      makeFile("spec.pdf", "application/pdf"),
    ]);
    expect(result.documents[0]?.fileName).toBe("spec.pdf");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/attachments/documents",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("7. request without attachments stays empty (no crash)", () => {
    expect(filterImageFiles([])).toEqual([]);
    expect(filterDocumentFiles([])).toEqual([]);
  });

  it("8. rejects unsupported formats", () => {
    expect(() =>
      assertSupportedImage({
        mimeType: "application/x-msdownload",
        fileName: "a.exe",
        byteLength: 100,
      }),
    ).toThrow(ImageValidationError);

    expect(() =>
      assertSupportedDocument({
        fileName: "a.exe",
        mimeType: "application/octet-stream",
        bytes: 100,
      }),
    ).toThrow(DocumentValidationError);
  });

  it("9. rejects oversized files", () => {
    expect(() =>
      assertSupportedImage({
        mimeType: "image/jpeg",
        fileName: "huge.jpg",
        byteLength: ATTACHMENT_LIMITS.maxOriginalBytes + 1,
      }),
    ).toThrow(/MB/);

    expect(() =>
      assertDocumentBatchLimits([{ bytes: 60 * 1024 * 1024 }]),
    ).toThrow(/合計|上限/);
  });

  it("10. mobile ask UI source exposes attach / camera / file buttons", () => {
    const picker = readFileSync(
      path.join(process.cwd(), "components/vision/image-attachment-picker.tsx"),
      "utf8",
    );
    const docs = readFileSync(
      path.join(process.cwd(), "components/request/request-document-picker.tsx"),
      "utf8",
    );
    const home = readFileSync(
      path.join(process.cwd(), "components/home/home-chat-bar.tsx"),
      "utf8",
    );
    const work = readFileSync(
      path.join(process.cwd(), "components/workspace/work-request-form.tsx"),
      "utf8",
    );

    expect(picker).toContain("attachPickImage");
    expect(picker).toContain("attachTakePhoto");
    expect(picker).toContain('capture="environment"');
    expect(docs).toContain("attachPickFile");
    const i18n = readFileSync(
      path.join(process.cwd(), "lib/i18n/ja.ts"),
      "utf8",
    );
    expect(i18n).toContain('attachPickImage: "画像を選ぶ"');
    expect(i18n).toContain('attachTakePhoto: "カメラで撮る"');
    expect(i18n).toContain('attachPickFile: "ファイルを選ぶ"');
    expect(home).toContain("ImageAttachmentPicker");
    expect(home).toContain("RequestDocumentPicker");
    expect(work).toContain("attachmentIds");
    expect(work).toContain("ImageAttachmentPicker");
    expect(work).toContain("buildWorkRequestSubmitPayload");
    expect(home).toContain("buildWorkRequestSubmitPayload");
    expect(home).toContain("stashPendingWorkRequestSubmit");
  });

  it("surfaces preprocess diagnosticId without treating it as AI failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: "この画像を読み込めませんでした。元画像が破損している可能性があります。",
            code: "image_corrupt",
            stage: "preprocess.sharp",
            failedStage: "preprocess",
            developerCode: "image_corrupt",
            diagnosticId: "idiag_copy_me",
            traceId: "vtr_copy",
          }),
          { status: 400 },
        ),
      ),
    );
    await expect(
      uploadImagesToAtlas([makeFile("broken.jpg", "image/jpeg")]),
    ).rejects.toMatchObject({
      name: "ClientImageUploadError",
      code: "image_corrupt",
      failedStage: "preprocess",
      developerCode: "image_corrupt",
      diagnosticId: "idiag_copy_me",
    });
    await expect(
      uploadImagesToAtlas([makeFile("broken.jpg", "image/jpeg")]),
    ).rejects.not.toMatchObject({
      message: expect.stringContaining("AI解析"),
    });
    expect(ClientImageUploadError).toBeTruthy();
  });
});
