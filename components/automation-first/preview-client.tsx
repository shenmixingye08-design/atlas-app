"use client";

import { Suspense, useEffect, useState } from "react";

import { AutomationFirstHome } from "@/components/automation-first/automation-first-home";
import { TodayWorkPage } from "@/components/automation-first/today-work-page";
import { AutomationsDashboard } from "@/components/automations/automations-dashboard";
import { SettingsHub } from "@/components/settings/settings-hub";
import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import type { Automation } from "@/lib/automations/types";
import type { Project } from "@/lib/projects/types";
import { cn } from "@/lib/design-system/cn";

type View = "home" | "today" | "settings" | "empty" | "automations";

export function AutomationFirstPreviewClient({
  automations,
  projects,
}: {
  automations: Automation[];
  projects: Project[];
}) {
  const [view, setView] = useState<View>("home");
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    document.documentElement.classList.add("automation-design-system");
    document.documentElement.setAttribute("data-theme", theme);
    return () => {
      document.documentElement.classList.remove("automation-design-system");
    };
  }, [theme]);

  // DEV sandbox only: serve fixture automations to the real dashboard.
  const [fetchShimReady, setFetchShimReady] = useState(false);
  useEffect(() => {
    if (view !== "automations") return;
    const original = window.fetch;
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = new URL(url, window.location.origin).pathname;
      if (path === "/api/automations") {
        return Promise.resolve(Response.json(automations));
      }
      if (path === "/api/automation-platform/runs") {
        return Promise.resolve(Response.json({ runs: [] }));
      }
      return original(input, init);
    };
    queueMicrotask(() => setFetchShimReady(true));
    return () => {
      window.fetch = original;
      setFetchShimReady(false);
    };
  }, [view, automations]);

  return (
    <AtlasAppShell active="projects" width="wide">
      <div className="mb-6 flex flex-wrap gap-2 border-b border-[var(--border)] pb-4">
        {(
          [
            ["home", "ホーム（自動化あり）"],
            ["empty", "ホーム（0件）"],
            ["today", "今日の仕事"],
            ["settings", "設定ハブ"],
            ["automations", "自動化"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={cn(
              "min-h-10 rounded-[var(--radius-md)] px-3 text-sm",
              view === id
                ? "bg-[var(--brand)] text-[var(--brand-foreground)]"
                : "border border-[var(--border)]",
            )}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
          className="min-h-10 rounded-[var(--radius-md)] border border-[var(--border)] px-3 text-sm"
        >
          テーマ: {theme}
        </button>
      </div>

      {view === "home" ? (
        <AutomationFirstHome automations={automations} projects={projects} />
      ) : null}
      {view === "empty" ? (
        <AutomationFirstHome automations={[]} projects={[]} />
      ) : null}
      {view === "today" ? (
        <TodayWorkPage initialAutomations={automations} />
      ) : null}
      {view === "automations" && fetchShimReady ? (
        <Suspense fallback={null}>
          <AutomationsDashboard />
        </Suspense>
      ) : null}
      {view === "settings" ? (
        <SettingsHub
          forceEnabled
          legacy={<p className="text-sm text-[var(--text-muted)]">従来設定</p>}
        />
      ) : null}
    </AtlasAppShell>
  );
}
