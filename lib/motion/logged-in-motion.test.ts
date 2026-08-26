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

  it("keeps the mobile menu button above the always-mounted drawer overlay", () => {
    const sidebar = src("components/layout/atlas-sidebar.tsx");
    expect(sidebar).toContain('aria-label={ui.nav.openSidebar}');
    expect(sidebar).toContain("z-[55]");
    expect(sidebar).toContain("top-[var(--mobile-top-bar-height)]");
    expect(sidebar).toContain("pointer-events-none");
    expect(sidebar).toContain("inert");
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

  it("uses official View Transitions without remounting the page tree", () => {
    const config = src("next.config.ts");
    const shell = src("components/layout/atlas-app-shell.tsx");
    const vt = src("components/motion/app-view-transition.tsx");
    const reveal = src("components/motion/page-reveal.tsx");
    expect(config).toContain("viewTransition: true");
    expect(shell).toContain("AppViewTransition");
    expect(shell).toContain("MotionProvider");
    expect(shell).not.toContain("<AppViewTransition key=");
    expect(vt).toContain("ViewTransition");
    expect(reveal).toContain("supportsViewTransition");
  });

  it("defines a once-only completion moment with live region and stroke check", () => {
    const moment = src("components/motion/completion-moment.tsx");
    const workspace = src("components/workspace/workspace-dashboard.tsx");
    const result = src("components/results/secretary-result-view.tsx");
    expect(moment).toContain("aria-live");
    expect(moment).toContain("motion-complete-check");
    expect(moment).toContain("consumeCompletionMotion");
    expect(moment).not.toContain("confetti");
    expect(workspace).toContain("CompletionMoment");
    expect(result).toContain("CompletionMoment");
  });

  it("staggers home intro once and crossfades skeleton without remounting lists", () => {
    const home = src("components/automation-first/automation-first-home.tsx");
    const secretary = src("components/home/secretary-home-dashboard.tsx");
    expect(home).toContain("RevealStagger");
    expect(home).toContain("ContentSwap");
    expect(home).toContain("AnimatedNumber");
    expect(secretary).toContain("RevealStagger");
    expect(home).toContain("MOTION_PLAY_KEYS.homeIntro");
  });

  it("morphs submit into processing without a premature success state", () => {
    const submit = src("components/motion/submit-morph.tsx");
    const form = src("components/workspace/work-request-form.tsx");
    const composer = src("components/home/secretary-chat-composer.tsx");
    expect(submit).toContain('phase === "processing"');
    expect(submit).not.toContain('"completed"');
    expect(submit).not.toContain("isSuccess");
    expect(form).toContain("SubmitMorph");
    expect(form).toContain("handleSubmit");
    expect(composer).toContain("if (submitting) return");
    expect(composer).toContain("SubmitMorph");
  });

  it("keeps android-lite and no transition-all on the request path", () => {
    const css = src("app/globals.css");
    const lite = src("lib/motion/android-lite.ts");
    const composer = src("components/home/secretary-chat-composer.tsx");
    const form = src("components/workspace/work-request-form.tsx");
    expect(css).toContain("html.motion-lite");
    expect(css).toContain("motion-complete-check");
    expect(lite).toContain("detectMotionLite");
    expect(composer).not.toContain("transition-all");
    expect(form).not.toContain("transition-all");
  });
});
