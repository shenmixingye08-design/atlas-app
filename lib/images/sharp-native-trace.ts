/**
 * Next.js file-tracing globs for Sharp / libvips native binaries.
 *
 * NFT follows the JS require graph. `@img/sharp-libvips-linux-x64/lib/index.js`
 * only exports `__dirname`, so `libvips-cpp.so.*` is invisible to the tracer
 * and Vercel lambdas ship the linux-x64 `.node` without the matching .so.
 *
 * Keep these as optionalDependencies in package.json (os/cpu filtered) so
 * macOS / Windows `npm ci` does not EBADPLATFORM. Tracing includes copy
 * whichever platform packages the Linux build actually installed.
 *
 * Do not import this file from billing / automation list routes.
 */
export const SHARP_NATIVE_TRACE_GLOBS = [
  "node_modules/@img/sharp-libvips-linux-x64/**/*",
  "node_modules/@img/sharp-libvips-linuxmusl-x64/**/*",
  "node_modules/@img/sharp-linux-x64/**/*",
  "node_modules/@img/sharp-linuxmusl-x64/**/*",
] as const;

/**
 * Routes that call `loadSharp()` (or probe it). picomatch against the route path.
 * Do not attach these globs to `/*` — that would copy ~18MB libvips into every
 * function, including automations / billing list hydrators.
 */
export const SHARP_NATIVE_TRACE_ROUTES = [
  "/api/attachments/images",
  "/api/attachments/*",
  "/api/attachments/**",
  "/api/vision/analyze",
  "/api/vision/*",
  "/api/vision/**",
  "/api/health/core-readiness",
  "/api/health/sharp-runtime",
  "/api/health/vision",
  "/api/health/ocr-engine",
  "/api/health/*",
  "/api/health/**",
  "/api/receipt/*",
  "/api/receipt/**",
  "/api/deliverables/*",
  "/api/deliverables/**",
  // Primary user path: home upload → POST /api/work/jobs → commander + vision.
  // #361 traced attachment/vision routes only; vision re-normalizes on the job lambda.
  "/api/work/jobs",
  "/api/work/jobs/*",
  "/api/work/jobs/**",
  "/api/commander",
  "/api/commander/*",
  "/api/commander/**",
] as const;

export function sharpNativeTraceIncludes(): Record<string, string[]> {
  const globs = [...SHARP_NATIVE_TRACE_GLOBS];
  return Object.fromEntries(
    SHARP_NATIVE_TRACE_ROUTES.map((route) => [route, globs]),
  );
}

export const SHARP_PACKAGE_VERSION = "0.35.3";
export const SHARP_LINUX_X64_VERSION = "0.35.3";
export const SHARP_LIBVIPS_LINUX_X64_VERSION = "1.3.2";
export const LIBVIPS_SONAME = "libvips-cpp.so.8.18.3";
