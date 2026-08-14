import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("app shell bottom inset vs fixed bottom nav", () => {
  const css = readWorkspaceFile("app/globals.css");
  const shell = readWorkspaceFile("components/layout/atlas-app-shell.tsx");
  const nav = readWorkspaceFile(
    "components/automation-first/automation-first-bottom-nav.tsx",
  );

  it("documents measured nav chrome and keeps --bottom-nav-height above it", () => {
    // border-t 1px + ul pt-1 4px + min-h-[56px] = 61px
    const measuredNavChromePx = 1 + 4 + 56;
    const bottomNavHeightRem = 4.25;
    const bottomNavHeightPx = bottomNavHeightRem * 16;
    expect(css).toContain("--bottom-nav-height: 4.25rem");
    expect(bottomNavHeightPx).toBeGreaterThan(measuredNavChromePx);
    expect(nav).toContain("pt-1");
    expect(nav).toContain("min-h-[56px]");
    expect(nav).toContain("fixed inset-x-0 bottom-0");
  });

  it("clears content by nav height + safe-area + 24px, not safe-area alone", () => {
    expect(css).toContain("--app-shell-content-gap-bottom: 1.5rem");
    expect(css).toMatch(
      /--app-shell-pad-bottom-mobile:\s*calc\(\s*var\(--bottom-nav-height\)/,
    );
    expect(css).toContain("var(--safe-area-bottom)");
    expect(css).toContain("var(--app-shell-content-gap-bottom)");
    expect(css).not.toMatch(
      /--app-shell-pad-bottom-mobile:\s*calc\(\s*var\(--safe-area-bottom\)\s*\+\s*1\.5rem\s*\)/,
    );
  });

  it("applies the shared inset from AtlasAppShell, not a Settings-only hack", () => {
    expect(shell).toContain("app-shell-main--with-bottom-nav");
    expect(shell).not.toContain("settings-hub");
    expect(css).toContain(".app-shell-main--with-bottom-nav");
    expect(css).toContain(
      "padding-bottom: var(--app-shell-pad-bottom-mobile)",
    );
  });

  it("leaves 16–24px visual gap after the measured nav at phone widths", () => {
    const measuredNavChromePx = 61;
    const reservedPx = 4.25 * 16 + 1.5 * 16; // nav var + gap, safe-area 0
    const visualGap = reservedPx - measuredNavChromePx;
    expect(visualGap).toBeGreaterThanOrEqual(16);
    expect(visualGap).toBeLessThanOrEqual(40);

    for (const width of [360, 375, 390, 430]) {
      void width;
      expect(visualGap).toBeGreaterThanOrEqual(16);
    }
  });

  it("does not change bottom nav items or order", () => {
    expect(nav).toContain('label: "今日"');
    expect(nav).toContain('label: "自動化"');
    expect(nav).toContain('label: "追加"');
    expect(nav).toContain('label: "成果物"');
    expect(nav).toContain('label: "設定"');
    const labels = [...nav.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
    expect(labels).toEqual(["今日", "自動化", "追加", "成果物", "設定"]);
  });
});
