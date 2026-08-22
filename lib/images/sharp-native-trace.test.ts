import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  LIBVIPS_SONAME,
  SHARP_LIBVIPS_LINUX_X64_VERSION,
  SHARP_LINUX_X64_VERSION,
  SHARP_NATIVE_TRACE_GLOBS,
  SHARP_NATIVE_TRACE_ROUTES,
  SHARP_PACKAGE_VERSION,
  sharpNativeTraceIncludes,
} from "./sharp-native-trace";

const ROOT = process.cwd();

describe("Sharp / libvips native packaging contract", () => {
  it("pins matching sharp + linux-x64 + libvips versions", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
      optionalDependencies: Record<string, string>;
    };
    expect(pkg.dependencies.sharp).toBe(`^${SHARP_PACKAGE_VERSION}`);
    expect(pkg.optionalDependencies["@img/sharp-linux-x64"]).toBe(
      SHARP_LINUX_X64_VERSION,
    );
    expect(pkg.optionalDependencies["@img/sharp-libvips-linux-x64"]).toBe(
      SHARP_LIBVIPS_LINUX_X64_VERSION,
    );
    expect(SHARP_LINUX_X64_VERSION).toBe(SHARP_PACKAGE_VERSION);
  });

  it("keeps linux native packages optional so macOS npm ci does not EBADPLATFORM", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
      optionalDependencies: Record<string, string>;
    };
    expect(pkg.dependencies["@img/sharp-linux-x64"]).toBeUndefined();
    expect(pkg.dependencies["@img/sharp-libvips-linux-x64"]).toBeUndefined();
    expect(pkg.optionalDependencies["@img/sharp-linux-x64"]).toBeTruthy();
    expect(pkg.optionalDependencies["@img/sharp-libvips-linux-x64"]).toBeTruthy();
  });

  it("traces image routes for the libvips shared object tree", () => {
    const includes = sharpNativeTraceIncludes();
    expect(includes["/api/attachments/images"]).toEqual([
      ...SHARP_NATIVE_TRACE_GLOBS,
    ]);
    expect(SHARP_NATIVE_TRACE_ROUTES).toContain("/api/health/sharp-runtime");
    expect(SHARP_NATIVE_TRACE_GLOBS.some((glob) => glob.includes("libvips-linux-x64"))).toBe(
      true,
    );
    const nextConfig = readFileSync(join(ROOT, "next.config.ts"), "utf8");
    expect(nextConfig).toContain("outputFileTracingIncludes");
    expect(nextConfig).toContain("sharpNativeTraceIncludes");
    expect(nextConfig).toContain("@img/sharp-libvips-linux-x64");
    expect(nextConfig).not.toMatch(/outputFileTracingIncludes:\s*\{\s*'\/\*'/);
  });

  it("does not eager-import sharp from load-sharp or normalize-raster", () => {
    const load = readFileSync(join(ROOT, "lib/images/load-sharp.ts"), "utf8");
    const raster = readFileSync(join(ROOT, "lib/images/normalize-raster.ts"), "utf8");
    const preprocess = readFileSync(join(ROOT, "lib/attachments/preprocess.ts"), "utf8");
    for (const source of [load, raster, preprocess]) {
      expect(source).not.toMatch(/^import\s+sharp\s+from\s+["']sharp["']/m);
      expect(source).not.toMatch(/require\(\s*["']sharp["']\s*\)/);
    }
    expect(load).toContain('await import("sharp")');
  });

  it("built NFT for image routes includes libvips-cpp.so when .next exists", () => {
    const nft = join(
      ROOT,
      ".next/server/app/api/attachments/images/route.js.nft.json",
    );
    if (!existsSync(nft)) return;
    const files = (
      JSON.parse(readFileSync(nft, "utf8")) as { files: string[] }
    ).files;
    expect(files.some((file) => file.includes(LIBVIPS_SONAME))).toBe(true);
  });

  it("libvips soname matches the installed linux-x64 package when present", () => {
    const versionsPath = join(
      ROOT,
      "node_modules/@img/sharp-libvips-linux-x64/versions.json",
    );
    if (!existsSync(versionsPath)) return;
    const versions = JSON.parse(readFileSync(versionsPath, "utf8")) as {
      vips: string;
    };
    expect(LIBVIPS_SONAME).toBe(`libvips-cpp.so.${versions.vips}`);
    expect(
      existsSync(
        join(
          ROOT,
          "node_modules/@img/sharp-libvips-linux-x64/lib",
          LIBVIPS_SONAME,
        ),
      ),
    ).toBe(true);
  });
});
