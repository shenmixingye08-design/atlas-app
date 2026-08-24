import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("work memory mobile UI", () => {
  const source = readFileSync(
    "components/settings/work-memory-settings.tsx",
    "utf8",
  );

  it("keeps 44px tap targets and confirm/reject copy", () => {
    expect(source).toContain("min-h-[44px]");
    expect(source).toContain("confirmCandidate");
    expect(source).toContain("rejectCandidate");
    expect(source).toContain("safe-area-inset-bottom");
    expect(source).toContain("w-full");
    expect(source).toContain("min-[390px]");
  });

  it("shows real confirm errors instead of swallowed ErrorState", () => {
    expect(source).not.toContain("ErrorState");
    expect(source).toContain("MemoryActionError");
    expect(source).toContain('role="alert"');
    expect(source).toContain("再読み込みして再試行");
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).not.toContain("window.confirm");
  });
});
