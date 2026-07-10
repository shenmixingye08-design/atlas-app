"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import type { DeliverableFormat } from "@/lib/deliverables/types";

import {
  SALES_FORMAT_OPTIONS,
  formatPresetLabel,
  presetGeneratesFiles,
  presetToFormats,
} from "@/lib/workspace/sales-material/format-presets";
import { requestSalesMaterialOutline } from "@/lib/workspace/sales-material/outline-client";
import {
  hasUsedSalesMaterialBefore,
  loadSalesMaterialPreferences,
  updateSalesMaterialPreferences,
} from "@/lib/workspace/sales-material/preferences";
import { recordDeliverableFormatChoice } from "@/lib/user-profile";
import type {
  SalesCostMode,
  SalesFormatPreset,
  SalesMaterialOutline,
  SalesMaterialSessionConfig,
} from "@/lib/workspace/sales-material/types";

export type SalesMaterialWizardResult =
  | {
      kind: "generate";
      assignment: string;
      config: SalesMaterialSessionConfig;
    }
  | {
      kind: "text_only";
      assignment: string;
      outline: SalesMaterialOutline;
      config: SalesMaterialSessionConfig;
    };

type SalesMaterialWizardProps = {
  assignment: string;
  onComplete: (result: SalesMaterialWizardResult) => void;
  onCancel: () => void;
};

type WizardStep =
  | "returning_prompt"
  | "format"
  | "cost_confirm"
  | "outline_loading"
  | "outline_review";

const COST_MODE_OPTIONS: {
  id: SalesCostMode;
  label: string;
  description: string;
}[] = [
  {
    id: "low",
    label: "低コスト",
    description: "テキスト/Markdown中心・画像なし・短め",
  },
  {
    id: "standard",
    label: "標準",
    description: "PowerPointまたはPDFを1形式・必要最低限の図表",
  },
  {
    id: "high",
    label: "高品質",
    description: "複数形式・詳細文章・図表候補（コスト高）",
  },
];

function outlineToMarkdown(outline: SalesMaterialOutline): string {
  const lines = [
    `# 営業資料 構成案`,
    "",
    `## 目的`,
    outline.purpose,
    "",
    `## 想定ターゲット`,
    outline.targetAudience,
    "",
    `## 全体構成`,
    ...outline.structure.map((item, index) => `${index + 1}. ${item}`),
    "",
    `## 各セクション`,
    ...outline.sections.flatMap((section) => [
      `### ${section.heading}`,
      section.keyMessage,
      section.visualCandidates.length > 0
        ? `図表候補: ${section.visualCandidates.join("、")}`
        : "",
      "",
    ]),
  ];

  if (outline.notes.trim()) {
    lines.push(`## 備考`, outline.notes);
  }

  return lines.join("\n").trim();
}

export function formatOutlineAsDisplayText(outline: SalesMaterialOutline): string {
  return outlineToMarkdown(outline);
}

function buildSessionConfig(
  formatPreset: SalesFormatPreset,
  costMode: SalesCostMode,
  outline: SalesMaterialOutline | undefined,
  skipFileGeneration: boolean,
): SalesMaterialSessionConfig {
  return {
    formatPreset,
    formats: skipFileGeneration ? [] : presetToFormats(formatPreset),
    costMode,
    skipFileGeneration,
    outlineApproved: Boolean(outline),
    outline,
  };
}

function persistPreferences(
  formatPreset: SalesFormatPreset,
  costMode: SalesCostMode,
  updateDefault: boolean,
  assignment: string,
): void {
  updateSalesMaterialPreferences({
    last_selected_output_format: formatPreset,
    preferred_output_formats: updateDefault ? formatPreset : loadSalesMaterialPreferences().preferred_output_formats,
    cost_saving_mode: costMode,
  });
  recordDeliverableFormatChoice(assignment, formatPreset);
}

export function SalesMaterialWizard({
  assignment,
  onComplete,
  onCancel,
}: SalesMaterialWizardProps) {
  const initialPrefs = useMemo(() => loadSalesMaterialPreferences(), []);
  const returningUser = useMemo(() => hasUsedSalesMaterialBefore(), []);

  const [step, setStep] = useState<WizardStep>(() =>
    returningUser && initialPrefs.ask_before_file_generation
      ? "returning_prompt"
      : "format",
  );
  const [formatPreset, setFormatPreset] = useState<SalesFormatPreset>(
    initialPrefs.last_selected_output_format,
  );
  const [costMode, setCostMode] = useState<SalesCostMode>(
    initialPrefs.cost_saving_mode,
  );
  const [outline, setOutline] = useState<SalesMaterialOutline | null>(null);
  const [outlineError, setOutlineError] = useState<string | null>(null);

  const loadOutline = useCallback(async () => {
    setStep("outline_loading");
    setOutlineError(null);
    try {
      const generated = await requestSalesMaterialOutline(assignment, costMode);
      setOutline(generated);
      setStep("outline_review");
    } catch (error) {
      setOutlineError(
        error instanceof Error ? error.message : "構成案の生成に失敗しました",
      );
      setStep("format");
    }
  }, [assignment, costMode]);

  useEffect(() => {
    if (step !== "outline_loading") return;
    void loadOutline();
  }, [step, loadOutline]);

  const handleFormatConfirm = () => {
    if (costMode === "high" || formatPreset === "all") {
      setStep("cost_confirm");
      return;
    }
    setStep("outline_loading");
  };

  const handleProceedFromOutline = () => {
    persistPreferences(formatPreset, costMode, false, assignment);
    const config = buildSessionConfig(formatPreset, costMode, outline ?? undefined, false);
    const enrichedAssignment = outline
      ? `${assignment}\n\n【承認済み構成案】\n${outlineToMarkdown(outline)}`
      : assignment;
    onComplete({ kind: "generate", assignment: enrichedAssignment, config });
  };

  const handleTextOnlyComplete = () => {
    if (!outline) return;
    persistPreferences("txt", costMode, false, assignment);
    const config = buildSessionConfig("txt", costMode, outline, true);
    onComplete({ kind: "text_only", assignment, outline, config });
  };

  if (step === "returning_prompt") {
    const label = formatPresetLabel(initialPrefs.last_selected_output_format);
    return (
      <Card padding="lg" className="space-y-6 animate-fade-in">
        <div className="space-y-2">
          <p className="text-sm font-medium text-accent">ATLAS</p>
          <h2 className="text-title text-foreground">営業資料を作成します</h2>
          <p className="text-body">
            前回と同じ形式（{label}）で作成しますか？
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="primary"
            onClick={() => {
              setFormatPreset(initialPrefs.last_selected_output_format);
              setCostMode(initialPrefs.cost_saving_mode);
              setStep("outline_loading");
            }}
          >
            はい、この形式で作成
          </Button>
          <Button variant="secondary" onClick={() => setStep("format")}>
            今回だけ変更
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              updateSalesMaterialPreferences({ ask_before_file_generation: false });
              setStep("format");
            }}
          >
            今後の標準設定を変更
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            キャンセル
          </Button>
        </div>
      </Card>
    );
  }

  if (step === "format") {
    return (
      <Card padding="lg" className="space-y-6 animate-fade-in">
        <div className="space-y-2">
          <p className="text-sm font-medium text-accent">ATLAS</p>
          <h2 className="text-title text-foreground">
            どの形式で作成しますか？
          </h2>
          <p className="text-caption text-[var(--foreground-muted)]">
            必要な形式だけ選ぶことで、生成時間とコストを抑えられます。
          </p>
        </div>

        {outlineError && <ErrorState message={outlineError} />}

        <div className="grid gap-2 sm:grid-cols-2">
          {SALES_FORMAT_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setFormatPreset(option.id)}
              className={`rounded-[var(--radius-lg)] border px-4 py-3 text-left transition-colors ${
                formatPreset === option.id
                  ? "border-accent bg-accent/5"
                  : "border-[var(--border-subtle)] hover:border-accent/40"
              }`}
            >
              <p className="font-medium text-foreground">{option.label}</p>
              <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                {option.description}
              </p>
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold text-foreground">品質モード</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {COST_MODE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setCostMode(option.id)}
                className={`rounded-[var(--radius-lg)] border px-3 py-2 text-left text-sm transition-colors ${
                  costMode === option.id
                    ? "border-accent bg-accent/5"
                    : "border-[var(--border-subtle)] hover:border-accent/40"
                }`}
              >
                <p className="font-medium">{option.label}</p>
                <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                  {option.description}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="primary" onClick={handleFormatConfirm}>
            構成案を作成
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            キャンセル
          </Button>
        </div>
      </Card>
    );
  }

  if (step === "cost_confirm") {
    return (
      <Card padding="lg" className="space-y-6 animate-fade-in">
        <div className="space-y-2">
          <p className="text-sm font-medium text-[var(--status-warning)]">ATLAS</p>
          <h2 className="text-title text-foreground">コスト確認</h2>
          <p className="text-body">
            選択された設定（
            {formatPresetLabel(formatPreset)} /{" "}
            {COST_MODE_OPTIONS.find((item) => item.id === costMode)?.label}
            ）は生成時間とAPIコストが高くなります。続行しますか？
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" onClick={() => setStep("outline_loading")}>
            続行する
          </Button>
          <Button variant="secondary" onClick={() => setStep("format")}>
            設定を変更
          </Button>
        </div>
      </Card>
    );
  }

  if (step === "outline_loading") {
    return (
      <Card padding="lg" className="space-y-4 animate-fade-in">
        <p className="text-sm font-medium text-accent">ATLAS</p>
        <h2 className="text-title text-foreground">構成案を作成しています…</h2>
        <p className="animate-soft-pulse text-caption">
          いきなりファイルは作りません。まず低コストで全体構成を整理します。
        </p>
      </Card>
    );
  }

  if (step === "outline_review" && outline) {
    return (
      <Card padding="lg" className="space-y-6 animate-fade-in">
        <div className="space-y-2">
          <p className="text-sm font-medium text-accent">ATLAS</p>
          <h2 className="text-title text-foreground">
            構成案を作成しました。確認してください。
          </h2>
          <p className="text-caption text-[var(--foreground-muted)]">
            選択形式: {formatPresetLabel(formatPreset)}
            {!presetGeneratesFiles(formatPreset) && "（テキストのみ）"}
          </p>
        </div>

        <div className="max-h-[420px] space-y-4 overflow-auto rounded-[var(--radius-lg)] bg-[var(--background-subtle)] px-5 py-4 text-sm leading-relaxed">
          <section>
            <h3 className="font-semibold text-foreground">目的</h3>
            <p className="mt-1 text-[var(--foreground-muted)]">{outline.purpose}</p>
          </section>
          <section>
            <h3 className="font-semibold text-foreground">想定ターゲット</h3>
            <p className="mt-1 text-[var(--foreground-muted)]">{outline.targetAudience}</p>
          </section>
          <section>
            <h3 className="font-semibold text-foreground">全体構成</h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[var(--foreground-muted)]">
              {outline.structure.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </section>
          <section className="space-y-3">
            <h3 className="font-semibold text-foreground">各スライド / 章</h3>
            {outline.sections.map((section) => (
              <div
                key={section.heading}
                className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-2"
              >
                <p className="font-medium text-foreground">{section.heading}</p>
                <p className="mt-1 text-[var(--foreground-muted)]">
                  {section.keyMessage}
                </p>
                {section.visualCandidates.length > 0 && (
                  <p className="mt-1 text-xs text-[var(--foreground-muted)]">
                    図表候補: {section.visualCandidates.join("、")}
                  </p>
                )}
              </div>
            ))}
          </section>
          {outline.notes.trim() && (
            <p className="text-xs text-[var(--foreground-muted)]">{outline.notes}</p>
          )}
        </div>

        <p className="text-body">この構成で資料を作成しますか？</p>

        <div className="flex flex-wrap gap-3">
          <Button variant="primary" onClick={handleProceedFromOutline}>
            このまま作成
          </Button>
          <Button variant="secondary" onClick={() => setStep("format")}>
            形式を変更する
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setStep("outline_loading");
            }}
          >
            修正する
          </Button>
          <Button variant="secondary" onClick={handleTextOnlyComplete}>
            テキストだけで完了する
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            キャンセル
          </Button>
        </div>
      </Card>
    );
  }

  return null;
}

export function formatsForWizardConfig(
  config: SalesMaterialSessionConfig,
): DeliverableFormat[] | undefined {
  if (config.skipFileGeneration || config.formats.length === 0) {
    return [];
  }
  return config.formats;
}
