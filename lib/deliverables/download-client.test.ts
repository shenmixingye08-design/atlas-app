import { afterEach, describe, expect, it, vi } from "vitest";

const triggerMock = vi.fn<(blob: Blob, fileName: string) => Promise<void>>(
  async () => undefined,
);

vi.mock("@/lib/browser/trigger-blob-download", () => ({
  triggerBlobDownload: (blob: Blob, fileName: string) =>
    triggerMock(blob, fileName),
}));

import { downloadDeliverableFile } from "./download-client";

function zipMagicBuffer(): ArrayBuffer {
  const bytes = new Uint8Array(2048);
  bytes[0] = 0x50;
  bytes[1] = 0x4b;
  bytes[2] = 0x03;
  bytes[3] = 0x04;
  // pad with zeros — size gate is client-side PK check only here
  return bytes.buffer;
}

describe("downloadDeliverableFile client guards", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    triggerMock.mockReset();
  });

  it("Blob-ifies Uint8Array with Word MIME and never octet-stream", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(zipMagicBuffer(), {
          status: 200,
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "Content-Disposition": 'attachment; filename="report.docx"',
          },
        }),
      ),
    );

    await downloadDeliverableFile({
      url: "/api/deliverables/abc",
      fileName: "report.docx",
      format: "docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    expect(triggerMock).toHaveBeenCalledTimes(1);
    const [blob, name] = triggerMock.mock.calls[0]!;
    expect(name).toBe("report.docx");
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(blob.type).not.toBe("application/octet-stream");
    expect(blob.type).not.toBe("text/plain");
  });

  it("rejects text/plain Content-Type for Word", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(zipMagicBuffer(), {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }),
      ),
    );

    await expect(
      downloadDeliverableFile({
        url: "/api/deliverables/abc",
        fileName: "report.docx",
        format: "docx",
      }),
    ).rejects.toThrow(/不正な形式/);
    expect(triggerMock).not.toHaveBeenCalled();
  });

  it("rejects non-PK body for docx", async () => {
    const bad = new TextEncoder().encode("not a zip");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(bad, {
          status: 200,
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          },
        }),
      ),
    );

    await expect(
      downloadDeliverableFile({
        url: "/api/deliverables/abc",
        fileName: "report.docx",
        format: "docx",
      }),
    ).rejects.toThrow(/ZIP署名/);
  });
});
