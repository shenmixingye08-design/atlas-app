import "server-only";

import { loadSharp } from "./load-sharp";

export type SharpRuntimeProbe = {
  ok: boolean;
  code: "ok" | "sharp_unavailable" | "sharp_metadata_mismatch";
};

/**
 * Cheap linux-x64 sharp/libvips check for image/OCR paths only.
 * Never import this from billing, automation list, settings, home, or auth.
 * Does not call OpenAI or other billed APIs.
 */
export async function probeSharpRuntime(): Promise<SharpRuntimeProbe> {
  try {
    const sharp = await loadSharp();
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#112233" },
    })
      .png()
      .toBuffer();
    const meta = await sharp(png).metadata();
    if (meta.format !== "png" || meta.width !== 8) {
      return { ok: false, code: "sharp_metadata_mismatch" };
    }
    return { ok: true, code: "ok" };
  } catch {
    return { ok: false, code: "sharp_unavailable" };
  }
}
