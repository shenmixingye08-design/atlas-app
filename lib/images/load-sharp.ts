import "server-only";

/**
 * Lazy sharp loader for image-processing paths only.
 *
 * Top-level `import sharp from "sharp"` evaluates the native binding as soon as
 * the module graph loads. That pulled libvips into GET /api/automations and
 * GET /api/billing/summary on Vercel linux-x64 and crashed those routes when
 * the .so was missing from the function bundle.
 *
 * Call this only from upload / vision / Office-embed helpers — never from
 * list/hydrate entrypoints.
 */
type SharpFn = (typeof import("sharp"))["default"];

let cached: SharpFn | null = null;

export async function loadSharp(): Promise<SharpFn> {
  if (cached) return cached;
  const loaded = await import("sharp");
  const fn = loaded.default;
  cached = fn;
  return fn;
}
