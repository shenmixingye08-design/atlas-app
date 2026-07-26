"use client";

import { useMemo, useState } from "react";

import type { ArtifactMissingField } from "@/lib/artifact-engine/document";
import {
  loadOrgAssistProfile,
  saveOrgAssistProfile,
  type OrgAssistProfile,
} from "@/lib/artifact-engine/org-assist-store";
import { Button } from "@/components/ui/button";

type ArtifactQualityAssistPanelProps = {
  missingFields: readonly ArtifactMissingField[];
  onProfileChange?: (profile: OrgAssistProfile) => void;
};

/**
 * Inline learning assist — collect missing org fields without leaving the result screen.
 * Does not modify User Profile core.
 */
export function ArtifactQualityAssistPanel({
  missingFields,
  onProfileChange,
}: ArtifactQualityAssistPanelProps) {
  const initial = useMemo(() => loadOrgAssistProfile(), []);
  const [draft, setDraft] = useState<OrgAssistProfile>(initial);
  const [skipped, setSkipped] = useState(false);
  const [savedMode, setSavedMode] = useState<"once" | "profile" | null>(null);

  if (skipped || missingFields.length === 0) return null;

  const visible = missingFields.slice(0, 6);

  const updateField = (key: string, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveOnce = () => {
    onProfileChange?.(draft);
    setSavedMode("once");
  };

  const handleSaveProfile = () => {
    const saved = saveOrgAssistProfile(draft);
    onProfileChange?.(saved);
    setSavedMode("profile");
  };

  return (
    <div className="space-y-3 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface)] px-4 py-4">
      <div>
        <p className="text-sm font-semibold text-foreground">
          この情報を登録すると、次回からより実用的な成果物を作れます
        </p>
        <p className="mt-1 text-xs text-[var(--foreground-muted)]">
          成果物画面のまま入力できます。プロフィールコアは変更しません。
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {visible.map((field) => (
          <label key={field.key} className="space-y-1 text-sm">
            <span className="font-medium text-foreground">{field.label}</span>
            <input
              className="w-full rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-accent/40"
              placeholder={field.placeholder}
              value={String(draft[field.key as keyof OrgAssistProfile] ?? "")}
              onChange={(event) => updateField(field.key, event.target.value)}
            />
          </label>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="sm" onClick={handleSaveOnce}>
          今回だけ入力
        </Button>
        <Button size="sm" variant="secondary" onClick={handleSaveProfile}>
          プロフィールへ保存
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setSkipped(true)}
        >
          今回はスキップ
        </Button>
      </div>

      {savedMode === "once" ? (
        <p className="text-xs text-[var(--foreground-muted)]">
          今回のプレビューへ反映しました。
        </p>
      ) : null}
      {savedMode === "profile" ? (
        <p className="text-xs text-[var(--foreground-muted)]">
          学習アシスト用プロフィールへ保存しました。次回から自動反映されます。
        </p>
      ) : null}
    </div>
  );
}
