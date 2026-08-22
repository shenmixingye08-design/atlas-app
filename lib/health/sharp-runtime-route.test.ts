import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GET } from "@/app/api/health/sharp-runtime/route";

describe("GET /api/health/sharp-runtime", () => {
  it("loads Sharp + libvips and preprocesses a JPEG", async () => {
    const response = await GET();
    const body = (await response.json()) as {
      ok: boolean;
      sharpLoadOk: boolean;
      libvipsLoadOk: boolean;
      libvipsSoPresent: boolean;
      jpegEncodeOk: boolean;
      pngEncodeOk: boolean;
      webpEncodeOk: boolean;
      jpegPreprocessOk: boolean;
      sharpVersion: string | null;
      libvipsVersion: string | null;
    };
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.sharpLoadOk).toBe(true);
    expect(body.libvipsLoadOk).toBe(true);
    expect(body.libvipsSoPresent).toBe(true);
    expect(body.jpegEncodeOk).toBe(true);
    expect(body.pngEncodeOk).toBe(true);
    expect(body.webpEncodeOk).toBe(true);
    expect(body.jpegPreprocessOk).toBe(true);
    expect(body.sharpVersion).toMatch(/^0\.35\./);
    expect(body.libvipsVersion).toMatch(/^8\.18\./);
  });

  it("does not top-level import sharp", () => {
    const source = readFileSync(
      join(process.cwd(), "app/api/health/sharp-runtime/route.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/^import\s+sharp\s+from\s+["']sharp["']/m);
    expect(source).toContain('from "@/lib/images/probe-sharp"');
  });
});
