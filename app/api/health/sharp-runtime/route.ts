import { getHealthVersionPayload } from "@/lib/health/version-info";
import { preprocessImageBuffer } from "@/lib/attachments/preprocess";
import { probeSharpRuntime } from "@/lib/images/probe-sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Public Sharp / libvips runtime smoke. No auth, no OpenAI, no Storage.
 * Used to prove Vercel Preview/Production actually loaded native libvips
 * and can preprocess JPEG — not just that `next build` passed.
 */
export async function GET(): Promise<Response> {
  const version = getHealthVersionPayload();
  const probe = await probeSharpRuntime();

  let jpegPreprocessOk = false;
  let failedStage: "sharp_load" | "preprocess" | null = probe.ok
    ? null
    : "sharp_load";
  let developerCode: string | null = probe.ok ? "ok" : probe.code;

  if (probe.ok) {
    try {
      const { loadSharp } = await import("@/lib/images/load-sharp");
      const sharp = await loadSharp();
      const jpeg = await sharp({
        create: {
          width: 48,
          height: 32,
          channels: 3,
          background: { r: 40, g: 80, b: 120 },
        },
      })
        .jpeg({ quality: 85 })
        .toBuffer();
      const processed = await preprocessImageBuffer({
        buffer: jpeg,
        diagnosticId: "idiag_sharp_runtime_smoke",
      });
      jpegPreprocessOk =
        processed.mimeType === "image/jpeg" &&
        processed.width > 0 &&
        processed.diagnostic.developerCode === "ok";
      if (!jpegPreprocessOk) {
        failedStage = "preprocess";
        developerCode = processed.diagnostic.developerCode;
      }
    } catch {
      jpegPreprocessOk = false;
      failedStage = "preprocess";
      developerCode = "preprocess_failed";
    }
  }

  const ok = probe.ok && jpegPreprocessOk && probe.libvipsSoPresent;
  return Response.json(
    {
      ok,
      status: ok ? "ok" : "unavailable",
      sharpLoadOk: probe.ok,
      libvipsLoadOk: probe.ok && Boolean(probe.libvipsVersion),
      libvipsSoPresent: probe.libvipsSoPresent,
      jpegEncodeOk: probe.jpegEncodeOk,
      pngEncodeOk: probe.pngEncodeOk,
      webpEncodeOk: probe.webpEncodeOk,
      jpegPreprocessOk,
      sharpVersion: probe.sharpVersion,
      libvipsVersion: probe.libvipsVersion,
      failedStage,
      developerCode,
      environment: version.environment,
      commitShaShort: version.commitShaShort,
    },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}
