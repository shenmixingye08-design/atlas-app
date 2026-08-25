import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MOTION_MS, MOTION_Y } from "@/lib/motion/tokens";

const ROOT = process.cwd();

function src(relative: string): string {
  return readFileSync(join(ROOT, relative), "utf8");
}

describe("logged-in motion contracts", () => {
  it("replays page motion without remounting App Router children", () => {
    const pageReveal = src("components/motion/page-reveal.tsx");
    const shell = src("components/layout/atlas-app-shell.tsx");
    expect(pageReveal).toContain("usePathname");
    expect(pageReveal).toContain("node.animate");
    expect(pageReveal).not.toContain("key={pathname}");
    expect(pageReveal).toContain("prefers-reduced-motion");
    expect(shell).toContain("PageReveal");
    expect(shell).toContain("usePathScrollRestoration");
    expect(shell).not.toContain("<PageReveal key=");
  });

  it("keeps page travel in the 4–8px / 120–240ms band", () => {
    expect(MOTION_Y.page).toBeGreaterThanOrEqual(4);
    expect(MOTION_Y.page).toBeLessThanOrEqual(8);
    expect(MOTION_MS.page).toBeGreaterThanOrEqual(120);
    expect(MOTION_MS.page).toBeLessThanOrEqual(240);
    expect(MOTION_MS.modal).toBeGreaterThanOrEqual(220);
    expect(MOTION_MS.modal).toBeLessThanOrEqual(320);
  });

  it("animates real progress with scaleX and never fakes a percent", () => {
    const home = src("components/home/home-in-progress-panel.tsx");
    const progress = src("components/ui/progress.tsx");
    const wizard = src("components/automations/v2/wizard-shell.tsx");
    const exportBar = src("components/settings/data-export-settings.tsx");
    expect(home).not.toContain("progress ?? 45");
    expect(home).toContain("indeterminate");
    expect(progress).toContain("scaleX");
    expect(wizard).toContain("scaleX");
    expect(wizard).not.toContain("transition-[width]");
    expect(exportBar).toContain("scaleX");
    expect(exportBar).not.toContain("Math.max(progress, 4)");
  });

  it("reuses ModalChrome on logged-in sheets instead of a second library", () => {
    const createSheet = src("components/automation-first/create-sheet.tsx");
    const history = src("components/activity-history/activity-history-detail.tsx");
    const v1 = src("components/automations/automation-detail-panel.tsx");
    const v2 = src("components/automations/v2/automation-v2-detail-panel.tsx");
    expect(createSheet).toContain("ModalChrome");
    expect(history).toContain("ModalChrome");
    expect(v1).toContain("ModalChrome");
    expect(v2).toContain("ModalChrome");
    expect(src("package.json")).not.toContain("framer-motion");
  });

  it("does not blank notification / memory lists on refetch", () => {
    const notices = src("components/notifications/notification-list.tsx");
    const memory = src("components/settings/memory-settings.tsx");
    const workMemory = src("components/settings/work-memory-settings.tsx");
    expect(notices).toContain("hasLoadedRef");
    expect(memory).toContain("hasLoadedRef");
    expect(workMemory).toContain("hasLoadedRef");
    expect(notices).toContain("MotionList");
  });

  it("keeps reduced-motion and 44px tap targets on motion primitives", () => {
    const css = src("app/globals.css");
    const segmented = src("components/motion/segmented.tsx");
    const button = src("components/ui/button.tsx");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain(".motion-status");
    expect(css).toContain(".motion-progress-fill");
    expect(segmented).toContain("min-h-[44px]");
    expect(segmented).toContain("useReducedMotion");
    expect(button).toContain("aria-busy");
    expect(button).toContain("isLoading");
  });
});
