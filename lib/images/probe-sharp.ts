import "server-only";

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { loadSharp } from "./load-sharp";
import { LIBVIPS_SONAME } from "./sharp-native-trace";

export type SharpRuntimeProbe = {
  ok: boolean;
  code: "ok" | "sharp_unavailable" | "sharp_metadata_mismatch";
  sharpVersion: string | null;
  libvipsVersion: string | null;
  jpegEncodeOk: boolean;
  pngEncodeOk: boolean;
  webpEncodeOk: boolean;
  libvipsSoPresent: boolean;
};

function libvipsSoPresent(): boolean {
  const candidates = [
    join(
      process.cwd(),
      "node_modules/@img/sharp-libvips-linux-x64/lib",
      LIBVIPS_SONAME,
    ),
    join(
      process.cwd(),
      "node_modules/@img/sharp-libvips-linuxmusl-x64/lib",
      LIBVIPS_SONAME,
    ),
  ];
  try {
    const req = createRequire(import.meta.url);
    const pkg = req.resolve("@img/sharp-libvips-linux-x64/package.json");
    candidates.unshift(join(dirname(pkg), "lib", LIBVIPS_SONAME));
  } catch {
    /* package may be absent on non-linux hosts */
  }
  return candidates.some((path) => existsSync(path));
}

/**
 * Cheap linux-x64 sharp/libvips check for image/OCR paths only.
 * Never import this from billing, automation list, settings, home, or auth.
 * Does not call OpenAI or other billed APIs.
 */
export async function probeSharpRuntime(): Promise<SharpRuntimeProbe> {
  const soPresent = libvipsSoPresent();
  try {
    const sharp = await loadSharp();
    const versions = (
      sharp as unknown as {
        versions?: { sharp?: string; vips?: string };
      }
    ).versions;
    const sharpVersion = versions?.sharp ?? null;
    const libvipsVersion = versions?.vips ?? null;

    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#112233" },
    })
      .png()
      .toBuffer();
    const jpeg = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#445566" },
    })
      .jpeg({ quality: 80 })
      .toBuffer();
    const webp = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#778899" },
    })
      .webp({ quality: 80 })
      .toBuffer();

    const pngMeta = await sharp(png).metadata();
    const jpegMeta = await sharp(jpeg).metadata();
    const webpMeta = await sharp(webp).metadata();
    const pngEncodeOk = pngMeta.format === "png" && pngMeta.width === 8;
    const jpegEncodeOk = jpegMeta.format === "jpeg" && jpegMeta.width === 8;
    const webpEncodeOk = webpMeta.format === "webp" && webpMeta.width === 8;
    if (!pngEncodeOk || !jpegEncodeOk || !webpEncodeOk) {
      return {
        ok: false,
        code: "sharp_metadata_mismatch",
        sharpVersion,
        libvipsVersion,
        jpegEncodeOk,
        pngEncodeOk,
        webpEncodeOk,
        libvipsSoPresent: soPresent,
      };
    }
    return {
      ok: true,
      code: "ok",
      sharpVersion,
      libvipsVersion,
      jpegEncodeOk,
      pngEncodeOk,
      webpEncodeOk,
      libvipsSoPresent: soPresent,
    };
  } catch {
    return {
      ok: false,
      code: "sharp_unavailable",
      sharpVersion: null,
      libvipsVersion: null,
      jpegEncodeOk: false,
      pngEncodeOk: false,
      webpEncodeOk: false,
      libvipsSoPresent: soPresent,
    };
  }
}
