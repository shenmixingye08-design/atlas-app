"use client";

import { useEffect, useState } from "react";

import {
  loadExecutiveAssistantSettings,
  SECRETARY_MODE_LABELS,
  updateSecretaryMode,
  type SecretaryMode,
} from "@/lib/executive-assistant";

const MODE_HELP: Record<SecretaryMode, string> = {
  off: "提案を出しません。ホームのAI秘書パネルも静かにします。",
  suggest_only: "仕事を発見して提案だけします。実行は必ずあなたが決めます。",
  semi_auto: "提案に加えて、ワンタップで半自動実行へ進めます。",
  full_auto:
    "Approval が必要な手順以外は、MINERVOTが最後まで完了します。推測だけの自動実行はしません。",
};

/**
 * 秘書モード設定 — User Profile コアを書き換えず local 設定のみ。
 */
export function SecretaryModeSettings() {
  const [mode, setMode] = useState<SecretaryMode>("suggest_only");

  useEffect(() => {
    setMode(loadExecutiveAssistantSettings().secretaryMode);
  }, []);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-[length:var(--text-label)] font-semibold tracking-[0.08em] text-[var(--brand)]">
          AI Executive Assistant
        </p>
        <h1 className="text-[length:var(--text-page-title)] font-semibold text-[var(--text-primary)]">
          秘書モード
        </h1>
        <p className="text-[length:var(--text-body)] text-[var(--text-secondary)]">
          MINERVOTは待ちません。仕事を見つけ、提案し、モードに応じて進めます。
          毎回通知はしません。
        </p>
      </header>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-[var(--text-primary)]">
          動作レベル
        </legend>
        {(Object.keys(SECRETARY_MODE_LABELS) as SecretaryMode[]).map((key) => (
          <label
            key={key}
            className="flex cursor-pointer gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3"
          >
            <input
              type="radio"
              name="secretary-mode"
              className="mt-1"
              checked={mode === key}
              onChange={() => {
                updateSecretaryMode(key);
                setMode(key);
              }}
            />
            <span>
              <span className="block font-medium text-[var(--text-primary)]">
                {SECRETARY_MODE_LABELS[key]}
              </span>
              <span className="mt-0.5 block text-[length:var(--text-caption)] text-[var(--text-muted)]">
                {MODE_HELP[key]}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <p className="text-[length:var(--text-caption)] text-[var(--text-muted)]">
        禁止事項: 毎回提案・通知スパム・推測だけの自動化・Memory無視。
        却下した提案は再表示しません（スヌーズ可）。
      </p>
    </div>
  );
}
