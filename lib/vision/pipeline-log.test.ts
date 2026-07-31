import { describe, expect, it, vi } from "vitest";

import { logVisionPipeline, newVisionTraceId } from "@/lib/vision/pipeline-log";

describe("vision pipeline log", () => {
  it("emits structured stage logs without throwing", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logVisionPipeline({
      stage: "formdata_build",
      ok: true,
      fileCount: 1,
      formDataHasFiles: true,
    });
    logVisionPipeline({
      stage: "image_dropped",
      ok: false,
      dropReason: "test",
    });

    expect(info).toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    expect(newVisionTraceId().startsWith("vtr_")).toBe(true);

    info.mockRestore();
    error.mockRestore();
  });
});
