/**
 * Permanent CI guard: PC sidebar 「成果物」 must not highlight 「実行履歴」.
 *
 * CASE A: /history → artifacts active
 * CASE B: /results → artifacts active
 * CASE C: /automations/runs → history active
 * CASE D: 成果物 click → only artifacts has aria-current="page"
 * CASE E: mobile /history is artifacts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { AtlasNavPage } from "@/lib/layout/nav-types";

import {
  AUTOMATION_FIRST_SIDEBAR_PRIMARY,
  resolveAutomationFirstBottomNavId,
  resolveAutomationFirstSidebarActive,
} from "./nav";

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function ariaCurrentSidebarIds(
  pathname: string,
  explicit?: AtlasNavPage,
): AtlasNavPage[] {
  const active = resolveAutomationFirstSidebarActive(pathname, explicit);
  return AUTOMATION_FIRST_SIDEBAR_PRIMARY.filter((item) => item.id === active).map(
    (item) => item.id,
  );
}

describe("artifacts sidebar active (permanent)", () => {
  it("keeps 成果物 href at /history and 実行履歴 at /automations/runs", () => {
    const artifacts = AUTOMATION_FIRST_SIDEBAR_PRIMARY.find(
      (item) => item.id === "artifacts",
    );
    const history = AUTOMATION_FIRST_SIDEBAR_PRIMARY.find(
      (item) => item.id === "history",
    );
    expect(artifacts?.href).toBe("/history");
    expect(artifacts?.label).toBe("成果物");
    expect(history?.href).toBe("/automations/runs");
    expect(history?.label).toBe("実行履歴");
  });

  it("CASE A: /history → artifacts active", () => {
    const page = readWorkspaceFile("app/history/page.tsx");
    expect(page).toContain('AtlasAppShell active="artifacts"');
    expect(page).not.toContain('AtlasAppShell active="history"');
    expect(page).toContain("ActivityHistoryPageContent");

    expect(resolveAutomationFirstSidebarActive("/history")).toBe("artifacts");
    expect(resolveAutomationFirstSidebarActive("/history", "artifacts")).toBe(
      "artifacts",
    );
    // Stale page prop that caused Production: must not win.
    expect(resolveAutomationFirstSidebarActive("/history", "history")).toBe(
      "artifacts",
    );
  });

  it("CASE B: /results → artifacts active", () => {
    expect(resolveAutomationFirstSidebarActive("/results")).toBe("artifacts");
    expect(
      resolveAutomationFirstSidebarActive("/results/notif_123", "history"),
    ).toBe("artifacts");
  });

  it("CASE C: /automations/runs → history active", () => {
    expect(resolveAutomationFirstSidebarActive("/automations/runs")).toBe(
      "history",
    );
    expect(
      resolveAutomationFirstSidebarActive("/automations/runs", "automations"),
    ).toBe("history");
    expect(resolveAutomationFirstSidebarActive("/automations")).toBe(
      "automations",
    );
  });

  it("CASE D: 成果物 click highlights artifacts only", () => {
    const artifactsItem = AUTOMATION_FIRST_SIDEBAR_PRIMARY.find(
      (item) => item.id === "artifacts",
    );
    expect(artifactsItem?.href).toBe("/history");

    const current = ariaCurrentSidebarIds("/history", "artifacts");
    expect(current).toEqual(["artifacts"]);
    expect(current).not.toContain("history");

    const stale = ariaCurrentSidebarIds("/history", "history");
    expect(stale).toEqual(["artifacts"]);
    expect(stale).toHaveLength(1);
  });

  it("CASE E: mobile /history is artifacts", () => {
    expect(resolveAutomationFirstBottomNavId("/history")).toBe("artifacts");
    expect(resolveAutomationFirstBottomNavId("/history?q=deck")).toBe(
      "artifacts",
    );
    expect(resolveAutomationFirstBottomNavId("/results/n1")).toBe("artifacts");
    expect(resolveAutomationFirstBottomNavId("/automations/runs")).toBe(
      "automation",
    );
  });
});
