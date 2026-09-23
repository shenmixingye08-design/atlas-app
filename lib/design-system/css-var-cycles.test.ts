import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const css = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

/** Collect `--x: ...var(--y)...` declarations from blocks whose selector matches. */
function declarations(selectorTest: (selector: string) => boolean) {
  const map = new Map<string, string[]>();
  const blockRe = /([^{}]+)\{([^{}]*)\}/g;
  for (const match of css.matchAll(blockRe)) {
    const selector = match[1].replace(/\/\*[\s\S]*?\*\//g, "").trim();
    if (!selectorTest(selector)) continue;
    for (const decl of match[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      const refs = [...decl[2].matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
      map.set(decl[1], refs);
    }
  }
  return map;
}

function findCycle(graph: Map<string, string[]>): string[] | null {
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const visit = (node: string): string[] | null => {
    if (state.get(node) === 2) return null;
    if (state.get(node) === 1) return [...stack.slice(stack.indexOf(node)), node];
    state.set(node, 1);
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(node, 2);
    return null;
  };
  for (const node of graph.keys()) {
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return null;
}

function merged(...layers: Map<string, string[]>[]) {
  const out = new Map<string, string[]>();
  for (const layer of layers) for (const [k, v] of layer) out.set(k, v);
  return out;
}

describe("globals.css custom properties", () => {
  const root = declarations((s) => s === ":root");
  const dark = declarations((s) => s === 'html[data-theme="dark"]');
  const af = declarations((s) => s === "html.automation-design-system");

  it("has no var() cycles in light, dark or the automation design system", () => {
    expect(findCycle(root)).toBeNull();
    expect(findCycle(merged(root, dark))).toBeNull();
    expect(findCycle(merged(root, af))).toBeNull();
    expect(findCycle(merged(root, dark, af))).toBeNull();
  });
});
