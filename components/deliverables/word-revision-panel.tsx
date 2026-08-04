"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import {
  WORD_TEMPLATE_IDS,
  WORD_TEMPLATES,
  type WordTemplateId,
} from "@/lib/deliverables/word-templates";

type VersionRecord = {
  deliverableId: string;
  parentDeliverableId: string | null;
  version: number;
  isLatest: boolean;
  revisionReason: string | null;
  createdAt: string;
  displayName: string;
  internalFileName: string;
  downloadUrl: string;
  previewUrl: string;
};

type VersionsResponse = {
  groupId: string | null;
  currentDeliverableId?: string;
  versions: VersionRecord[];
  error?: string;
};

type RegenerateResponse = {
  deliverable?: {
    id: string;
    fileName: string;
    downloadUrl: string;
    metadata?: {
      version?: number | null;
      templateId?: string | null;
    };
  };
  error?: string;
};

type WordBrandForm = {
  companyName: string;
  contactName: string;
  footerText: string;
  defaultTemplateId: "" | WordTemplateId;
};

type BrandResponse = {
  brand?: {
    companyName?: string;
    contactName?: string;
    footerText?: string;
    defaultTemplateId?: string;
  } | null;
  error?: string;
};

type WordRevisionPanelProps = {
  parentDeliverableId: string;
  initialTitle: string;
  initialContent: string;
  initialTemplateId?: string | null;
};

const TEMPLATE_OPTIONS = WORD_TEMPLATE_IDS.map((id) => ({
  id,
  name: WORD_TEMPLATES[id].displayName,
}));

function isWordTemplateId(value: string | null | undefined): value is WordTemplateId {
  return Boolean(value && WORD_TEMPLATE_IDS.includes(value as WordTemplateId));
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function inputClassName(): string {
  return "min-h-11 w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";
}

export function WordRevisionPanel({
  parentDeliverableId,
  initialTitle,
  initialContent,
  initialTemplateId = null,
}: WordRevisionPanelProps) {
  const [title, setTitle] = useState(initialTitle);
  const [sourceContent, setSourceContent] = useState(initialContent);
  const [templateId, setTemplateId] = useState<WordTemplateId>(
    isWordTemplateId(initialTemplateId) ? initialTemplateId : "standard-document",
  );
  const [revisionReason, setRevisionReason] = useState("内容を修正して再生成");
  const [versions, setVersions] = useState<VersionRecord[]>([]);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [versionsBusy, setVersionsBusy] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [brand, setBrand] = useState<WordBrandForm>({
    companyName: "",
    contactName: "",
    footerText: "",
    defaultTemplateId: "",
  });
  const [brandBusy, setBrandBusy] = useState(false);
  const [brandMessage, setBrandMessage] = useState<string | null>(null);
  const [brandError, setBrandError] = useState<string | null>(null);

  const hasChanged = useMemo(
    () =>
      title.trim() !== initialTitle.trim() ||
      sourceContent.trim() !== initialContent.trim() ||
      revisionReason.trim() !== "内容を修正して再生成" ||
      templateId !== (isWordTemplateId(initialTemplateId) ? initialTemplateId : "standard-document"),
    [initialContent, initialTemplateId, initialTitle, revisionReason, sourceContent, templateId, title],
  );

  const loadVersions = useCallback(async () => {
    setVersionsBusy(true);
    setVersionsError(null);
    try {
      const response = await fetch(
        `/api/deliverables/${encodeURIComponent(parentDeliverableId)}/versions`,
        { cache: "no-store" },
      );
      const body = (await response.json().catch(() => ({}))) as VersionsResponse;
      if (!response.ok) {
        throw new Error(body.error ?? "版履歴を読み込めませんでした。");
      }
      setVersions(body.versions);
    } catch (err) {
      setVersionsError(
        err instanceof Error ? err.message : "版履歴を読み込めませんでした。",
      );
    } finally {
      setVersionsBusy(false);
    }
  }, [parentDeliverableId]);

  const loadBrand = useCallback(async () => {
    setBrandBusy(true);
    setBrandError(null);
    try {
      const response = await fetch("/api/deliverables/word/brand", {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => ({}))) as BrandResponse;
      if (!response.ok) {
        throw new Error(body.error ?? "会社情報を読み込めませんでした。");
      }
      const defaultTemplateId = isWordTemplateId(body.brand?.defaultTemplateId)
        ? body.brand.defaultTemplateId
        : "";
      setBrand({
        companyName: body.brand?.companyName ?? "",
        contactName: body.brand?.contactName ?? "",
        footerText: body.brand?.footerText ?? "",
        defaultTemplateId,
      });
    } catch (err) {
      setBrandError(
        err instanceof Error ? err.message : "会社情報を読み込めませんでした。",
      );
    } finally {
      setBrandBusy(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadVersions();
      void loadBrand();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadBrand, loadVersions]);

  const submitRevision = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch("/api/deliverables/word/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentDeliverableId,
          title: title.trim(),
          templateId,
          revisionReason: revisionReason.trim() || "内容を修正して再生成",
          editFields: {
            title: title.trim(),
            content: sourceContent,
            replacements: [],
          },
        }),
      });
      const body = (await response.json().catch(() => ({}))) as RegenerateResponse;
      if (!response.ok || !body.deliverable) {
        throw new Error(body.error ?? "Wordを再生成できませんでした。");
      }
      setSuccessMessage(
        `Wordを再生成しました（${body.deliverable.fileName}）。履歴からダウンロードできます。`,
      );
      await loadVersions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wordを再生成できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const saveBrand = async () => {
    if (brandBusy) return;
    setBrandBusy(true);
    setBrandError(null);
    setBrandMessage(null);
    try {
      const response = await fetch("/api/deliverables/word/brand", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: brand.companyName,
          contactName: brand.contactName,
          footerText: brand.footerText,
          defaultTemplateId: brand.defaultTemplateId || undefined,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as BrandResponse;
      if (!response.ok) {
        throw new Error(body.error ?? "会社情報を保存できませんでした。");
      }
      setBrandMessage("会社情報を保存しました。次回のWord生成に反映されます。");
      await loadBrand();
    } catch (err) {
      setBrandError(
        err instanceof Error ? err.message : "会社情報を保存できませんでした。",
      );
    } finally {
      setBrandBusy(false);
    }
  };

  return (
    <Card
      padding="md"
      className="space-y-6 bg-[var(--background-subtle)]/70 shadow-none"
      aria-label="Wordを編集して再生成"
    >
      <div>
        <h3 className="text-lg font-semibold text-foreground">
          Wordを編集して再生成
        </h3>
        <p className="mt-1 text-sm text-[var(--foreground-muted)]">
          本文とテンプレートを調整して、新しい版として保存します。
        </p>
      </div>

      <div className="grid gap-4">
        <label className="space-y-1 text-sm font-medium text-foreground">
          <span>タイトル</span>
          <input
            className={inputClassName()}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-label="Word文書のタイトル"
          />
        </label>

        <label className="space-y-1 text-sm font-medium text-foreground">
          <span>テンプレート</span>
          <select
            className={inputClassName()}
            value={templateId}
            onChange={(event) => {
              if (isWordTemplateId(event.target.value)) {
                setTemplateId(event.target.value);
              }
            }}
            aria-label="Wordテンプレート"
          >
            {TEMPLATE_OPTIONS.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm font-medium text-foreground">
          <span>本文</span>
          <textarea
            className={`${inputClassName()} min-h-[14rem] resize-y leading-relaxed`}
            value={sourceContent}
            onChange={(event) => setSourceContent(event.target.value)}
            aria-label="Word再生成に使う本文"
          />
        </label>

        <label className="space-y-1 text-sm font-medium text-foreground">
          <span>再生成理由</span>
          <input
            className={inputClassName()}
            value={revisionReason}
            onChange={(event) => setRevisionReason(event.target.value)}
            aria-label="Word再生成理由"
          />
        </label>
      </div>

      <div aria-live="polite" aria-atomic="true" className="space-y-3">
        {error ? <ErrorState message={error} /> : null}
        {successMessage ? (
          <p className="rounded-[var(--radius-lg)] border border-[var(--status-success)]/25 bg-[var(--status-success-bg)] px-4 py-3 text-sm text-[var(--status-success)]">
            {successMessage}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          size="sm"
          className="min-h-11 touch-manipulation"
          disabled={busy || !sourceContent.trim()}
          aria-label="Wordを新しい版として再生成"
          onClick={() => void submitRevision()}
        >
          {busy ? "再生成中" : hasChanged ? "再生成する" : "同じ内容で再生成する"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-11 touch-manipulation"
          disabled={versionsBusy}
          aria-label="Wordの版履歴を再読み込み"
          onClick={() => void loadVersions()}
        >
          履歴を更新
        </Button>
      </div>

      <section className="space-y-3" aria-labelledby="word-version-history-heading">
        <h4 id="word-version-history-heading" className="font-semibold text-foreground">
          版履歴
        </h4>
        <div aria-live="polite" aria-atomic="true">
          {versionsError ? <ErrorState message={versionsError} /> : null}
        </div>
        {versions.length > 0 ? (
          <ul className="space-y-2">
            {versions.map((version) => (
              <li
                key={version.deliverableId}
                className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    v{version.version} {version.isLatest ? "（最新版）" : "（旧版）"}
                  </p>
                  <p className="text-xs text-[var(--foreground-muted)]">
                    {formatDateTime(version.createdAt)}
                    {version.revisionReason ? ` / ${version.revisionReason}` : ""}
                  </p>
                </div>
                <a
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--surface-muted)] px-4 text-sm font-medium text-foreground transition hover:bg-[var(--secondary-hover)] focus-ring"
                  href={version.downloadUrl}
                  aria-label={`Word v${version.version}をダウンロード`}
                >
                  ダウンロード
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--foreground-muted)]">
            {versionsBusy ? "版履歴を読み込んでいます。" : "まだ版履歴はありません。"}
          </p>
        )}
      </section>

      <section
        className="space-y-4 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-4"
        aria-labelledby="word-brand-heading"
      >
        <div>
          <h4 id="word-brand-heading" className="font-semibold text-foreground">
            会社情報（Word用）
          </h4>
          <p className="mt-1 text-sm text-[var(--foreground-muted)]">
            ヘッダーやフッターに使う情報を保存します。未入力項目は出力しません。
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm font-medium text-foreground">
            <span>会社名</span>
            <input
              className={inputClassName()}
              value={brand.companyName}
              onChange={(event) =>
                setBrand((current) => ({
                  ...current,
                  companyName: event.target.value,
                }))
              }
              aria-label="Word用会社名"
            />
          </label>
          <label className="space-y-1 text-sm font-medium text-foreground">
            <span>担当者名</span>
            <input
              className={inputClassName()}
              value={brand.contactName}
              onChange={(event) =>
                setBrand((current) => ({
                  ...current,
                  contactName: event.target.value,
                }))
              }
              aria-label="Word用担当者名"
            />
          </label>
          <label className="space-y-1 text-sm font-medium text-foreground sm:col-span-2">
            <span>フッター文</span>
            <input
              className={inputClassName()}
              value={brand.footerText}
              onChange={(event) =>
                setBrand((current) => ({
                  ...current,
                  footerText: event.target.value,
                }))
              }
              aria-label="Word用フッター文"
            />
          </label>
          <label className="space-y-1 text-sm font-medium text-foreground sm:col-span-2">
            <span>既定テンプレート</span>
            <select
              className={inputClassName()}
              value={brand.defaultTemplateId}
              onChange={(event) =>
                setBrand((current) => ({
                  ...current,
                  defaultTemplateId: isWordTemplateId(event.target.value)
                    ? event.target.value
                    : "",
                }))
              }
              aria-label="Word用既定テンプレート"
            >
              <option value="">指定しない</option>
              {TEMPLATE_OPTIONS.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div aria-live="polite" aria-atomic="true" className="space-y-3">
          {brandError ? <ErrorState message={brandError} /> : null}
          {brandMessage ? (
            <p className="text-sm text-[var(--status-success)]">{brandMessage}</p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-11 touch-manipulation"
          disabled={brandBusy}
          aria-label="Word用会社情報を保存"
          onClick={() => void saveBrand()}
        >
          {brandBusy ? "保存中" : "会社情報を保存"}
        </Button>
      </section>
    </Card>
  );
}
