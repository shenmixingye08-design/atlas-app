import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const src = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../../components/motion/page-reveal.tsx",
  ),
  "utf8",
);

describe("PageReveal", () => {
  it("does not hide page content at opacity 0", () => {
    expect(src).not.toMatch(/opacity:\s*0/);
  });
});
