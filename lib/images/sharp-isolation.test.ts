import { readFileSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadSharp } from "./load-sharp";

const ROOT = process.cwd();

const LIST_HYDRATE_ENTRYPOINTS = [
  "app/api/automations/route.ts",
  "app/api/billing/summary/route.ts",
] as const;

const FORBIDDEN_HEAVY = [
  "lib/images/load-sharp.ts",
  "lib/images/probe-sharp.ts",
  "lib/health/core-readiness.ts",
] as const;

const STATIC_FROM =
  /(?:^|\n)import\s+(?:type\s+)?(?:[\s\S]*?)\s+from\s+["']([^"']+)["']/g;
const STATIC_SIDE_EFFECT = /(?:^|\n)import\s+["']([^"']+)["']/g;

function resolveImport(fromFile: string, spec: string): string | null {
  if (spec === "sharp") return "sharp";
  if (spec.startsWith("node:") || spec.startsWith("@clerk/") || !spec.startsWith("@/") && !spec.startsWith(".")) {
    return null;
  }
  const raw = spec.startsWith("@/")
    ? join(ROOT, spec.slice(2))
    : join(dirname(join(ROOT, fromFile)), spec);
  const noExt = normalize(raw);
  const candidates = extname(noExt)
    ? [noExt]
    : [
        `${noExt}.ts`,
        `${noExt}.tsx`,
        join(noExt, "index.ts"),
        join(noExt, "index.tsx"),
      ];
  for (const candidate of candidates) {
    try {
      readFileSync(candidate);
      return candidate.startsWith(ROOT)
        ? candidate.slice(ROOT.length + 1)
        : candidate;
    } catch {
      // try next
    }
  }
  return null;
}

function collectStaticGraph(entry: string): { files: string[]; sharpFiles: string[] } {
  const files: string[] = [];
  const sharpFiles: string[] = [];
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    files.push(file);
    let source: string;
    try {
      source = readFileSync(join(ROOT, file), "utf8");
    } catch {
      continue;
    }
    if (
      /(?:^|\n)import\s+sharp\s+from\s+["']sharp["']/.test(source) ||
      /(?:^|\n)import\s+["']sharp["']/.test(source) ||
      /require\(\s*["']sharp["']\s*\)/.test(source)
    ) {
      sharpFiles.push(file);
    }
    const specs = new Set<string>();
    for (const match of source.matchAll(STATIC_FROM)) {
      const lineStart = source.lastIndexOf("\n", match.index ?? 0) + 1;
      const line = source.slice(lineStart, source.indexOf("\n", lineStart));
      if (line.includes("import type ")) continue;
      if (match[1]) specs.add(match[1]);
    }
    for (const match of source.matchAll(STATIC_SIDE_EFFECT)) {
      if (match[1]) specs.add(match[1]);
    }
    for (const spec of specs) {
      const resolved = resolveImport(file, spec);
      if (resolved === "sharp") {
        sharpFiles.push(file);
        continue;
      }
      if (resolved) queue.push(resolved);
    }
  }
  return { files, sharpFiles };
}

describe("sharp isolation from list/hydrate APIs", () => {
  for (const entry of LIST_HYDRATE_ENTRYPOINTS) {
    it(`${entry} static graph does not import sharp or image runtime`, () => {
      const graph = collectStaticGraph(entry);
      expect(graph.files.length).toBeGreaterThan(5);
      expect(graph.sharpFiles, graph.sharpFiles.join(", ")).toEqual([]);
      expect(
        FORBIDDEN_HEAVY.filter((file) => graph.files.includes(file)),
        `heavy modules leaked into ${entry}`,
      ).toEqual([]);
    });
  }

  it("core-readiness uses lazy probe-sharp and does not top-level import sharp", () => {
    const route = readFileSync(
      join(ROOT, "app/api/health/core-readiness/route.ts"),
      "utf8",
    );
    expect(route).not.toMatch(/^import\s+sharp\s+from\s+["']sharp["']/m);
    expect(route).not.toMatch(/^import\s+["']sharp["']/m);
    const graph = collectStaticGraph("app/api/health/core-readiness/route.ts");
    expect(graph.files).toContain("lib/images/probe-sharp.ts");
    expect(graph.files).toContain("lib/images/load-sharp.ts");
  });

  it("run-automation is not a static import of automation-service", () => {
    const source = readFileSync(
      join(ROOT, "lib/automations/automation-service.ts"),
      "utf8",
    );
    expect(source).not.toMatch(
      /import\s+\{[^}]*executeAutomationRun[^}]*\}\s+from\s+["']\.\/run-automation["']/,
    );
    expect(source).toMatch(/import\(\s*["']\.\/run-automation["']\s*\)/);
  });
});

describe("loadSharp on linux runtime", () => {
  it("imports sharp and can read metadata", async () => {
    const sharp = await loadSharp();
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#112233" },
    })
      .png()
      .toBuffer();
    const meta = await sharp(png).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(8);
  });
});
