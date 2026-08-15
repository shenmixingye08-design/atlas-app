import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("/automations/runs uses the shared AtlasAppShell", () => {
  const page = readWorkspaceFile("app/automations/runs/page.tsx");
  const list = readWorkspaceFile("components/automations/v2/run-list-page.tsx");
  const automations = readWorkspaceFile("app/automations/page.tsx");

  it("wraps the run list in AtlasAppShell like /automations", () => {
    expect(automations).toContain('AtlasAppShell active="automations"');
    expect(page).toContain('AtlasAppShell active="automations"');
    expect(page).toContain('width="narrow"');
    expect(page).toContain("<RunListPage");
    expect(page).not.toContain("AtlasPageShell");
  });

  it("does not invent a runs-only shell or bottom nav", () => {
    expect(page).not.toContain("AutomationFirstBottomNav");
    expect(list).not.toContain("AutomationFirstBottomNav");
    expect(list).not.toContain("AtlasAppShell");
  });

  it("drops RunListPage padding that would stack on the shell inset", () => {
    expect(list).not.toContain("max-w-3xl");
    expect(list).not.toContain("mx-auto w-full");
    expect(list).not.toMatch(/pb-\[calc\(/);
    expect(list).not.toContain("safe-area-inset-bottom");
    expect(list).toContain('className="space-y-6"');
  });

  it("keeps an in-page back link to the automations list", () => {
    expect(list).toContain('href="/automations"');
    expect(list).toContain("← 自動化一覧へ戻る");
  });
});
