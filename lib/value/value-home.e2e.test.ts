import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => React.createElement("a", { href }, children),
}));

vi.mock("@/components/home/home-chat-bar", () => ({
  HomeChatBar: () => React.createElement("div", { "data-testid": "ask-bar" }, "ask"),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    React.createElement("button", props, children),
}));

import { ValueHomeDashboard } from "@/components/home/value/value-home-dashboard";
import { resetValueStoreForTests } from "@/lib/value";

const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => storage.set(k, v),
  removeItem: (k: string) => storage.delete(k),
});
vi.stubGlobal("window", {
  localStorage: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  },
  dispatchEvent: () => true,
});

beforeEach(() => {
  storage.clear();
  resetValueStoreForTests();
});

describe("value home E2E markup", () => {
  it("renders outcome home with ROI and no AI jargon", () => {
    const now = new Date().toISOString();
    const html = renderToStaticMarkup(
      React.createElement(ValueHomeDashboard, {
        showAskBar: true,
        projects: [
          {
            id: "p1",
            title: "営業資料",
            workRequest: "資料作成",
            status: "completed",
            progress: 100,
            createdAt: now,
            updatedAt: now,
            assignedEmployees: [],
            result: null,
          },
        ],
        automations: [],
      }),
    );

    expect(html).toContain("data-testid=\"value-home-dashboard\"");
    expect(html).toContain("今日あなたが削減した仕事");
    expect(html).toContain("仕事削減メーター");
    expect(html).toContain("AI秘書レポート");
    expect(html).toContain("仕事完了一覧");
    expect(html).toContain("980");
    expect(html).not.toMatch(/\bLLM\b/);
    expect(html).not.toMatch(/\bPrompt\b/i);
    expect(html).not.toMatch(/\bToken\b/i);
    expect(html).not.toMatch(/\bWorkflow\b/);
    expect(html).not.toMatch(/\bNode\b/);
  });
});
