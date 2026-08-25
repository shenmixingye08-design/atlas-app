"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { UsageRemainingHint } from "@/components/billing/usage-remaining-hint";
import { RequestDocumentPicker } from "@/components/request/request-document-picker";
import {
  ImageAttachmentPicker,
  type LocalImageDraft,
} from "@/components/vision/image-attachment-picker";
import {
  createDeliverableBatchClient,
  parseDeliverableBatchSpreadsheetClient,
  runDeliverableBatchAction,
} from "@/lib/deliverable-batch/client";
import { parseCsvText } from "@/lib/deliverable-batch/parse-input";
import {
  DELIVERABLE_BATCH_COUNTS,
  DELIVERABLE_BATCH_LIVE_FORMATS,
  type DeliverableBatchFormat,
  type DeliverableBatchInputType,
} from "@/lib/deliverable-batch/types";
import type { DocumentExtractClient } from "@/lib/attachments/documents/client-upload";
import { cn } from "@/lib/design-system/cn";

const STEPS = ["方法", "入力", "共通", "形式", "試作", "生成"] as const;
const DRAFT_KEY = "atlas.deliverableBatchDraft";

const FORMAT_LABEL: Record<DeliverableBatchFormat, string> = {
  txt: "テキスト",
  docx: "Word",
  xlsx: "Excel",
  pdf: "PDF",
  pptx: "PowerPoint",
};

const COLUMN_OPTIONS = [
  ["title", "タイトル"],
  ["theme", "テーマ"],
  ["instruction", "固有指示"],
  ["audience", "対象読者"],
  ["include", "含める内容"],
  ["forbidden", "禁止事項"],
  ["fileName", "出力ファイル名"],
] as const;

type WizardDraft = {
  step: number;
  inputType: DeliverableBatchInputType;
  count: (typeof DELIVERABLE_BATCH_COUNTS)[number];
  shared: string;
  lines: string;
  purpose: string;
  audience: string;
  tone: string;
  length: string;
  structure: string;
  mustInclude: string;
  forbidden: string;
  format: DeliverableBatchFormat;
};

const DEFAULT_DRAFT: WizardDraft = {
  step: 0,
  inputType: "ai_themes",
  count: 3,
  shared: "",
  lines: "",
  purpose: "",
  audience: "",
  tone: "短く丁寧に",
  length: "",
  structure: "",
  mustInclude: "",
  forbidden: "",
  format: "txt",
};

const draftListeners = new Set<() => void>();

function readWizardDraft(): WizardDraft {
  if (typeof window === "undefined") return DEFAULT_DRAFT;
  const raw = window.sessionStorage.getItem(DRAFT_KEY);
  if (!raw) return DEFAULT_DRAFT;
  try {
    const parsed = JSON.parse(raw) as Partial<WizardDraft>;
    const count = parsed.count;
    return {
      ...DEFAULT_DRAFT,
      ...parsed,
      count: [3, 5, 7, 10, 12].includes(Number(count))
        ? (Number(count) as WizardDraft["count"])
        : 3,
      step: Math.min(5, Math.max(0, Number(parsed.step ?? 0))),
    };
  } catch {
    return DEFAULT_DRAFT;
  }
}

function writeWizardDraft(partial: Partial<WizardDraft>): void {
  const next = { ...readWizardDraft(), ...partial };
  window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next));
  draftListeners.forEach((listener) => listener());
}

function subscribeWizardDraft(listener: () => void): () => void {
  draftListeners.add(listener);
  return () => {
    draftListeners.delete(listener);
  };
}

export function DeliverableBatchWizard() {
  const router = useRouter();
  const draft = useSyncExternalStore(
    subscribeWizardDraft,
    readWizardDraft,
    () => DEFAULT_DRAFT,
  );
  const {
    step,
    inputType,
    count,
    shared,
    lines,
    purpose,
    audience,
    tone,
    length,
    structure,
    mustInclude,
    forbidden,
    format,
  } = draft;
  const [documents, setDocuments] = useState<DocumentExtractClient[]>([]);
  const [images, setImages] = useState<LocalImageDraft[]>([]);
  const [spreadsheetRows, setSpreadsheetRows] = useState<Array<Record<string, string>>>(
    [],
  );
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [sheetWarnings, setSheetWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);

  const setShared = (value: string) => writeWizardDraft({ shared: value });
  const setLines = (value: string) => writeWizardDraft({ lines: value });
  const setPurpose = (value: string) => writeWizardDraft({ purpose: value });
  const setAudience = (value: string) => writeWizardDraft({ audience: value });
  const setTone = (value: string) => writeWizardDraft({ tone: value });
  const setLength = (value: string) => writeWizardDraft({ length: value });
  const setStructure = (value: string) => writeWizardDraft({ structure: value });
  const setMustInclude = (value: string) => writeWizardDraft({ mustInclude: value });
  const setForbidden = (value: string) => writeWizardDraft({ forbidden: value });
  const setFormat = (value: DeliverableBatchFormat) => writeWizardDraft({ format: value });
  const setCount = (value: WizardDraft["count"]) => writeWizardDraft({ count: value });
  const setStep = (value: number) => writeWizardDraft({ step: value });
  const setInputType = (value: DeliverableBatchInputType) =>
    writeWizardDraft({ inputType: value });

  const lineCount = useMemo(
    () => lines.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length,
    [lines],
  );

  const onSpreadsheetFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      if (file.name.toLowerCase().endsWith(".csv") || file.type.includes("csv")) {
        const text = await file.text();
        const rows = parseCsvText(text);
        setSpreadsheetRows(rows);
        const headers = Object.keys(rows[0] ?? {});
        setColumnMap(
          Object.fromEntries(headers.map((header) => [header, guessColumn(header)])),
        );
        setSheetWarnings([]);
      } else {
        const parsed = await parseDeliverableBatchSpreadsheetClient(file);
        setSpreadsheetRows(parsed.rows);
        setColumnMap(
          Object.fromEntries(parsed.headers.map((header) => [header, guessColumn(header)])),
        );
        setSheetWarnings(parsed.duplicateWarnings);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "表を読めませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const imageItems = images
        .filter((image) => image.status === "uploaded" && image.uploaded)
        .map((image) => ({
          id: image.uploaded!.id,
          name: image.uploaded!.fileName,
          extractedText: "",
        }));
      const view = await createDeliverableBatchClient({
        name: shared.slice(0, 40) || "まとめて作成",
        inputType,
        common: {
          purpose,
          audience,
          tone,
          length,
          structure,
          template: "",
          mustInclude,
          forbidden,
          fileNameRule: "",
        },
        format,
        requestedCount: count,
        sharedInstruction: shared,
        lines: inputType === "line_list" ? lines.split(/\r?\n/) : undefined,
        spreadsheetRows: inputType === "spreadsheet" ? spreadsheetRows : undefined,
        columnMap: inputType === "spreadsheet" ? columnMap : undefined,
        attachments:
          inputType === "attachments"
            ? [
                ...documents.map((doc) => ({
                  id: doc.id,
                  name: doc.fileName,
                  extractedText: doc.extractedText,
                })),
                ...imageItems,
              ]
            : undefined,
      });
      setBatchId(view.batch.id);
      return view.batch.id;
    } catch (err) {
      setError(err instanceof Error ? err.message : "作成できませんでした。");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const runSample = async () => {
    const id = batchId ?? (await create());
    if (!id) return;
    setBusy(true);
    try {
      await runDeliverableBatchAction(id, "sample");
      window.sessionStorage.removeItem(DRAFT_KEY);
      router.push(`/workspace/batch/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "試作できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const runAll = async () => {
    const id = batchId ?? (await create());
    if (!id) return;
    setBusy(true);
    try {
      await runDeliverableBatchAction(id, "generate_remaining");
      window.sessionStorage.removeItem(DRAFT_KEY);
      router.push(`/workspace/batch/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 overflow-x-hidden pb-[max(1.5rem,env(safe-area-inset-bottom))] motion-reduce:transition-none">
      <header className="space-y-2 text-center">
        <p className="text-sm font-medium text-accent">まとめて作成</p>
        <h1 className="text-display text-foreground">成果物をまとめて作る</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          同じ形式で最大12件。最初の1件を試作してから、残りを作れます。
        </p>
      </header>

      <ol className="flex flex-wrap justify-center gap-2" aria-label="手順">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={cn(
              "rounded-full px-3 py-1 text-caption transition-opacity duration-150 motion-reduce:transition-none",
              index === step
                ? "bg-accent text-[var(--accent-foreground,#fff)]"
                : "bg-[var(--surface-muted)] text-[var(--text-secondary)]",
            )}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      <Card padding="lg" className="space-y-4">
        {step === 0 ? (
          <div className="space-y-2">
            {(
              [
                ["ai_themes", "AIにテーマを分けてもらう"],
                ["line_list", "一覧を直接入力"],
                ["spreadsheet", "CSV／Excelから入力"],
                ["attachments", "複数ファイル・画像から"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setInputType(id)}
                className={cn(
                  "flex min-h-[44px] w-full items-center rounded-[var(--radius-xl)] border px-4 text-left text-sm focus-ring motion-reduce:transition-none",
                  inputType === id
                    ? "border-accent bg-accent/10"
                    : "border-[var(--border-subtle)]",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-3">
            <Textarea
              label="共通の依頼"
              value={shared}
              onChange={(event) => setShared(event.target.value)}
              rows={4}
            />
            {inputType === "line_list" ? (
              <Textarea
                label="一覧（1行=1件）"
                value={lines}
                onChange={(event) => setLines(event.target.value)}
                rows={8}
              />
            ) : null}
            {inputType === "spreadsheet" ? (
              <div className="space-y-3">
                <label className="block text-sm font-medium">
                  CSV / Excel
                  <input
                    type="file"
                    accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="mt-2 block w-full text-sm"
                    onChange={(event) => void onSpreadsheetFile(event.target.files?.[0])}
                  />
                </label>
                <Textarea
                  label="またはCSVを貼り付け（1行=1件）"
                  value={lines}
                  onChange={(event) => {
                    setLines(event.target.value);
                    setSpreadsheetRows(parseCsvText(event.target.value));
                  }}
                  rows={6}
                />
                {sheetWarnings.length > 0 ? (
                  <p className="text-caption text-[var(--warning,#b45309)]">
                    {sheetWarnings[0]}
                  </p>
                ) : null}
                {spreadsheetRows[0] ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">列の割り当て</p>
                    {Object.keys(spreadsheetRows[0]).map((header) => (
                      <label key={header} className="flex min-h-[44px] items-center gap-2 text-sm">
                        <span className="w-28 truncate">{header}</span>
                        <select
                          className="min-h-[44px] flex-1 rounded-lg border border-[var(--border-subtle)] bg-background px-2"
                          value={columnMap[header] ?? guessColumn(header)}
                          onChange={(event) =>
                            setColumnMap((current) => ({
                              ...current,
                              [header]: event.target.value,
                            }))
                          }
                        >
                          <option value="">使わない</option>
                          {COLUMN_OPTIONS.map(([id, label]) => (
                            <option key={id} value={id}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {inputType === "attachments" ? (
              <div className="space-y-4">
                <RequestDocumentPicker value={documents} onChange={setDocuments} />
                <ImageAttachmentPicker value={images} onChange={setImages} />
                <p className="text-caption text-[var(--text-secondary)]">
                  ファイルまたは画像1件につき、成果物を1件作ります。
                </p>
              </div>
            ) : null}
            <div>
              <p className="mb-2 text-sm font-medium">作成数</p>
              <div className="flex flex-wrap gap-2">
                {DELIVERABLE_BATCH_COUNTS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setCount(value)}
                    className={cn(
                      "min-h-[44px] min-w-[44px] rounded-full border px-4 text-sm focus-ring motion-reduce:transition-none",
                      count === value
                        ? "border-accent bg-accent/10"
                        : "border-[var(--border-subtle)]",
                    )}
                  >
                    {value}件
                  </button>
                ))}
              </div>
              {inputType === "line_list" && lineCount > 0 ? (
                <p className="mt-2 text-caption text-[var(--text-secondary)]">
                  入力行 {lineCount} / 選択 {count}件
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-3">
            <Input label="目的" value={purpose} onChange={(event) => setPurpose(event.target.value)} />
            <Input
              label="対象読者"
              value={audience}
              onChange={(event) => setAudience(event.target.value)}
            />
            <Input label="文体" value={tone} onChange={(event) => setTone(event.target.value)} />
            <Input label="長さ" value={length} onChange={(event) => setLength(event.target.value)} />
            <Input
              label="構成"
              value={structure}
              onChange={(event) => setStructure(event.target.value)}
            />
            <Input
              label="必ず含める内容"
              value={mustInclude}
              onChange={(event) => setMustInclude(event.target.value)}
            />
            <Input
              label="禁止事項"
              value={forbidden}
              onChange={(event) => setForbidden(event.target.value)}
            />
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-2">
            {DELIVERABLE_BATCH_LIVE_FORMATS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setFormat(id)}
                className={cn(
                  "flex min-h-[44px] w-full items-center rounded-[var(--radius-xl)] border px-4 text-sm focus-ring motion-reduce:transition-none",
                  format === id ? "border-accent bg-accent/10" : "border-[var(--border-subtle)]",
                )}
              >
                {FORMAT_LABEL[id]}
              </button>
            ))}
            <p className="text-caption text-[var(--text-secondary)]">
              1つのまとめて作成では、同じ形式だけを使います。
            </p>
          </div>
        ) : null}

        {step === 4 || step === 5 ? (
          <div className="space-y-3 text-sm text-[var(--text-secondary)]">
            <p>
              {count}件の{FORMAT_LABEL[format]}を作ります。今月のAI利用枠を1件ずつ使います。
            </p>
            <UsageRemainingHint meterId="aiRuns" />
            <p>根拠のない完了時間は表示しません。試作の1件は、本生成で重複して作りません。</p>
            {step === 5 ? (
              <p>
                試作せずに全件作る場合も、件数と利用枠をご確認のうえお進みください。
              </p>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="text-sm text-[var(--error)]" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 min-[360px]:flex-col min-[390px]:flex-row">
          {step > 0 ? (
            <Button variant="secondary" className="min-h-[44px]" onClick={() => setStep(step - 1)}>
              戻る
            </Button>
          ) : (
            <Button
              variant="ghost"
              className="min-h-[44px]"
              onClick={() => router.push("/workspace")}
            >
              1件作成へ
            </Button>
          )}
          {step < 4 ? (
            <Button className="min-h-[44px]" onClick={() => setStep(step + 1)}>
              次へ
            </Button>
          ) : step === 4 ? (
            <Button className="min-h-[44px]" disabled={busy} onClick={() => void runSample()}>
              最初の1件を試作
            </Button>
          ) : (
            <Button className="min-h-[44px]" disabled={busy} onClick={() => void runAll()}>
              確認して全件生成
            </Button>
          )}
          {step === 4 ? (
            <Button variant="ghost" className="min-h-[44px]" onClick={() => setStep(5)}>
              試作せず進む
            </Button>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function guessColumn(header: string): string {
  const key = header.trim().toLowerCase();
  if (header.includes("タイトル") || key === "title") return "title";
  if (header.includes("テーマ") || key === "theme") return "theme";
  if (header.includes("指示") || key === "instruction") return "instruction";
  if (header.includes("読者") || key === "audience") return "audience";
  if (header.includes("含める") || key === "include") return "include";
  if (header.includes("禁止") || key === "forbidden") return "forbidden";
  if (header.includes("ファイル") || key.includes("file")) return "fileName";
  return "title";
}
