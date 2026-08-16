import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function listTsx(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...listTsx(full));
      continue;
    }
    if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("Owner page server guards", () => {
  it("keeps a layout-level requireAtlasOwner", () => {
    const layout = readFileSync("app/owner/layout.tsx", "utf8");
    expect(layout).toContain("requireAtlasOwner");
  });

  it("guards the notifications page on the server", () => {
    const page = readFileSync("app/owner/notifications/page.tsx", "utf8");
    expect(page).toContain("requireAtlasOwner");
    expect(page).toContain("ownerLocalCacheNotice");
  });

  it("does not leave Owner pages without a server Owner check", () => {
    const pages = listTsx("app/owner").filter((path) => path.endsWith("page.tsx"));
    expect(pages.length).toBeGreaterThan(10);
    for (const path of pages) {
      const source = readFileSync(path, "utf8");
      expect(source, path).toContain("requireAtlasOwner");
    }
  });
});
