"use client";

import { useEffect, useState } from "react";

import { AutomationFirstHome } from "@/components/automation-first/automation-first-home";
import { TodayWorkPage } from "@/components/automation-first/today-work-page";
import { SettingsHub } from "@/components/settings/settings-hub";
import { AtlasAppShell } from "@/components/layout/atlas-app-shell";
import type { Automation } from "@/lib/automations/types";
import type { Project } from "@/lib/projects/types";
import { cn } from "@/lib/design-system/cn";

type View = "home" | "today" | "settings" | "empty";

export function AutomationFirstPreviewClient({
  automations,
  projects,
  initialView = "home",
  initialTheme = "light",
}: {
  automations: Automation[];
  projects: Project[];
  initialView?: View;
  initialTheme?: "light" | "dark";
}) {
  const [view, setView] = useState<View>(initialView);
  const [theme, setTheme] = useState<"light" | "dark">(initialTheme);

  useEffect(() => {
    document.documentElement.classList.add("automation-design-system");
    document.documentElement.setAttribute("data-theme", theme);
    return () => {
      document.documentElement.classList.remove("automation-design-system");
    };
  }, [theme]);

  return (
    <AtlasAppShell active="projects" width="wide">
      <div className="mb-6 flex flex-wrap gap-2 border-b border-[var(--border)] pb-4">
        {(
          [
            ["home", "ホーム（自動化あり）"],
            ["empty", "ホーム（0件）"],
            ["today", "今日の仕事"],
            ["settings", "設定ハブ"],
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
      {view === "settings" ? (
        <SettingsHub
          forceEnabled
          legacy={<p className="text-sm text-[var(--text-muted)]">従来設定</p>}
        />
      ) : null}
    </AtlasAppShell>
  );
}
