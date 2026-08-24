"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { zonedWallTimeToDate } from "@/lib/integrations/x/post/autopost-schedule";
import {
  createXPostBatchClient,
  formatBatchDateTime,
  formatBatchStatus,
  getXPostBatchClient,
  listXPostBatchesClient,
  patchXPostBatchItemClient,
  runXPostBatchActionClient,
  X_AUTOPOST_WEEKDAY_LABELS,
  X_POST_BATCH_COUNT_OPTIONS,
  X_POST_BATCH_FIELD_CLASS,
  X_POST_BATCH_SAFE_BOTTOM,
  type XPostBatch,
  type XPostBatchItem,
} from "@/lib/integrations/x/post/batch-client";
import type { XPostBatchApprovalMode } from "@/lib/integrations/x/post/batch-types";
import { X_TWEET_MAX_CHARS } from "@/lib/integrations/x/post/validate";
import { ui } from "@/lib/i18n";

const copy = ui.xPostBatch;

type FormState = {
  purpose: string;
  theme: string;
  audience: string;
  tone: string;
  includeContent: string;
  forbiddenContent: string;
  hashtagPolicy: string;
  count: number;
  startDate: string;
  endDate: string;
  daysOfWeek: number[];
  postTime: string;
  approvalMode: XPostBatchApprovalMode;
};

function todayDateKey(timeZone = "Asia/Tokyo"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts;
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function defaultForm(): FormState {
  const start = todayDateKey();
  return {
    purpose: "有益情報の発信",
    theme: "",
    audience: "一般ユーザー",
    tone: "丁寧",
    includeContent: "",
    forbiddenContent: "",
    hashtagPolicy: "必要なときだけ1〜2個",
    count: 3,
    startDate: start,
    endDate: addDays(start, 13),
    daysOfWeek: [1, 2, 3, 4, 5],
    postTime: "10:00",
    approvalMode: "approval",
  };
}

function statusVariant(
  status: XPostBatch["status"] | XPostBatchItem["status"],
): "success" | "error" | "accent" | "default" {
  if (status === "published" || status === "scheduled" || status === "approved") {
    return "success";
  }
  if (status === "failed" || status === "partially_failed") return "error";
  if (status === "generating" || status === "ready") return "accent";
  return "default";
}

export function XPostBatchPanel() {
  const [form, setForm] = useState<FormState>(defaultForm);
  const [batches, setBatches] = useState<XPostBatch[]>([]);
  const [active, setActive] = useState<{
    batch: XPostBatch;
    items: XPostBatchItem[];
  } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    const result = await listXPostBatchesClient();
    if (result.status === "ready") setBatches(result.batches);
  }, []);

  const openBatch = useCallback(async (batchId: string) => {
    const result = await getXPostBatchClient(batchId);
    if (result.status === "ready") {
      setActive({ batch: result.batch, items: result.items });
      setSelected([]);
    } else {
      setError(result.message);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await loadList();
      } catch {
        if (!cancelled) setError("一覧を読み込めませんでした。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadList]);

  const applyResult = useCallback(
    (result: Awaited<ReturnType<typeof createXPostBatchClient>>) => {
      if (result.status === "ready") {
        setActive({ batch: result.batch, items: result.items });
        setSelected([]);
        setError(null);
        void loadList();
        return;
      }
      setError(result.message);
    },
    [loadList],
  );

  const onCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await createXPostBatchClient(form);
      applyResult(result);
    } catch {
      setError("まとめて作成に失敗しました。");
    } finally {
      setBusy(false);
    }
  };

  const onAction = async (
    action: Parameters<typeof runXPostBatchActionClient>[0]["action"],
  ) => {
    if (!active) return;
    setBusy(true);
    try {
      const result = await runXPostBatchActionClient({
        batchId: active.batch.id,
        action,
        itemIds: selected,
      });
      applyResult(result);
    } finally {
      setBusy(false);
    }
  };

  const onItemPatch = async (
    itemId: string,
    patch: Parameters<typeof patchXPostBatchItemClient>[0],
  ) => {
    if (!active) return;
    setBusy(true);
    try {
      const result = await patchXPostBatchItemClient({
        batchId: active.batch.id,
        itemId,
        ...patch,
      });
      applyResult(result);
    } finally {
      setBusy(false);
    }
  };

  const allSelected = useMemo(
    () =>
      Boolean(active && active.items.length > 0 && selected.length === active.items.length),
    [active, selected.length],
  );

  if (loading) return <LoadingState />;

  return (
    <section className={`space-y-6 ${X_POST_BATCH_SAFE_BOTTOM}`}>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">{copy.title}</h2>
        <p className="text-sm leading-6 text-[var(--foreground-muted)]">
          {copy.subtitle}
        </p>
      </div>

      <Card className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{copy.purpose}</span>
          <input
            className={X_POST_BATCH_FIELD_CLASS}
            value={form.purpose}
            onChange={(event) =>
              setForm((current) => ({ ...current, purpose: event.target.value }))
            }
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{copy.theme}</span>
          <input
            className={X_POST_BATCH_FIELD_CLASS}
            value={form.theme}
            onChange={(event) =>
              setForm((current) => ({ ...current, theme: event.target.value }))
            }
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{copy.audience}</span>
            <input
              className={X_POST_BATCH_FIELD_CLASS}
              value={form.audience}
              onChange={(event) =>
                setForm((current) => ({ ...current, audience: event.target.value }))
              }
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{copy.tone}</span>
            <input
              className={X_POST_BATCH_FIELD_CLASS}
              value={form.tone}
              onChange={(event) =>
                setForm((current) => ({ ...current, tone: event.target.value }))
              }
            />
          </label>
        </div>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{copy.includeContent}</span>
          <textarea
            className={`${X_POST_BATCH_FIELD_CLASS} h-24 py-3`}
            value={form.includeContent}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                includeContent: event.target.value,
              }))
            }
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{copy.forbiddenContent}</span>
          <textarea
            className={`${X_POST_BATCH_FIELD_CLASS} h-24 py-3`}
            value={form.forbiddenContent}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                forbiddenContent: event.target.value,
              }))
            }
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{copy.hashtagPolicy}</span>
          <input
            className={X_POST_BATCH_FIELD_CLASS}
            value={form.hashtagPolicy}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                hashtagPolicy: event.target.value,
              }))
            }
          />
        </label>
        <div>
          <p className="mb-2 text-sm font-medium">{copy.countLabel}</p>
          <p className="mb-3 text-xs text-[var(--foreground-muted)]">{copy.countHint}</p>
          <div className="grid grid-cols-4 gap-2">
            {X_POST_BATCH_COUNT_OPTIONS.map((count) => (
              <button
                key={count}
                type="button"
                className={`min-h-[44px] rounded-full text-sm ${
                  form.count === count
                    ? "bg-[var(--brand)] text-[var(--brand-foreground)]"
                    : "bg-[var(--surface-muted)]"
                }`}
                onClick={() => setForm((current) => ({ ...current, count }))}
              >
                {count}件
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{copy.startDate}</span>
            <input
              type="date"
              className={X_POST_BATCH_FIELD_CLASS}
              value={form.startDate}
              onChange={(event) =>
                setForm((current) => ({ ...current, startDate: event.target.value }))
              }
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{copy.endDate}</span>
            <input
              type="date"
              className={X_POST_BATCH_FIELD_CLASS}
              value={form.endDate}
              onChange={(event) =>
                setForm((current) => ({ ...current, endDate: event.target.value }))
              }
            />
          </label>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">{copy.daysOfWeek}</p>
          <div className="grid grid-cols-7 gap-1.5">
            {X_AUTOPOST_WEEKDAY_LABELS.map((label, index) => {
              const on = form.daysOfWeek.includes(index);
              return (
                <button
                  key={label}
                  type="button"
                  className={`min-h-[44px] rounded-full text-sm ${
                    on
                      ? "bg-[var(--brand)] text-[var(--brand-foreground)]"
                      : "bg-[var(--surface-muted)]"
                  }`}
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      daysOfWeek: on
                        ? current.daysOfWeek.filter((day) => day !== index)
                        : [...current.daysOfWeek, index],
                    }))
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{copy.postTime}</span>
          <input
            type="time"
            className={X_POST_BATCH_FIELD_CLASS}
            value={form.postTime}
            onChange={(event) =>
              setForm((current) => ({ ...current, postTime: event.target.value }))
            }
          />
        </label>
        <div>
          <p className="mb-2 text-sm font-medium">{copy.approvalMode}</p>
          <div className="grid grid-cols-2 gap-2">
            {(["approval", "full_auto"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`min-h-[44px] rounded-full text-sm ${
                  form.approvalMode === mode
                    ? "bg-[var(--brand)] text-[var(--brand-foreground)]"
                    : "bg-[var(--surface-muted)]"
                }`}
                onClick={() =>
                  setForm((current) => ({ ...current, approvalMode: mode }))
                }
              >
                {mode === "approval" ? copy.approval : copy.fullAuto}
              </button>
            ))}
          </div>
        </div>
        <Button
          className="w-full"
          isLoading={busy}
          onClick={() => void onCreate()}
        >
          {busy ? copy.submitting : copy.submit}
        </Button>
      </Card>

      {error ? (
        <p className="rounded-[var(--radius-xl)] bg-[var(--error-bg)] px-4 py-3 text-sm text-[var(--error)]">
          {error}
        </p>
      ) : null}

      {batches.length > 0 ? (
        <div className="space-y-2">
          {batches.slice(0, 8).map((batch) => (
            <button
              key={batch.id}
              type="button"
              className="flex min-h-[44px] w-full items-center justify-between rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-4 text-left"
              onClick={() => void openBatch(batch.id)}
            >
              <span className="text-sm">
                {batch.theme || batch.purpose || copy.title}（{batch.requestedCount}件）
              </span>
              <Badge variant={statusVariant(batch.status)}>
                {formatBatchStatus(batch.status)}
              </Badge>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--foreground-muted)]">{copy.empty}</p>
      )}

      {active ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusVariant(active.batch.status)}>
              {formatBatchStatus(active.batch.status)}
            </Badge>
            {active.batch.memoryApplied ? (
              <Badge variant="accent">{copy.memoryApplied}</Badge>
            ) : null}
          </div>
          {active.batch.connectionError ? (
            <p className="rounded-[var(--radius-xl)] bg-[var(--error-bg)] px-4 py-3 text-sm text-[var(--error)]">
              {copy.connectionError}: {active.batch.connectionError}
            </p>
          ) : null}
          <p className="text-sm text-[var(--foreground-muted)]">{copy.savedNotice}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() =>
                setSelected(allSelected ? [] : active.items.map((item) => item.id))
              }
            >
              {copy.selectAll}
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              disabled={busy}
              onClick={() => void onAction("approve_all")}
            >
              {copy.approveAll}
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              disabled={busy || selected.length === 0}
              onClick={() => void onAction("regenerate_selected")}
            >
              {copy.regenerateSelected}
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              disabled={busy || selected.length === 0}
              onClick={() => void onAction("delete_selected")}
            >
              {copy.deleteSelected}
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              disabled={busy}
              onClick={() => void onAction("redistribute")}
            >
              {copy.redistribute}
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              disabled={busy}
              onClick={() => void onAction("retry_failed")}
            >
              {copy.retryFailed}
            </Button>
          </div>

          <div className="space-y-4">
            {active.items.map((item) => (
              <BatchItemCard
                key={item.id}
                item={item}
                timeZone={active.batch.timezone}
                selected={selected.includes(item.id)}
                busy={busy}
                onToggle={() =>
                  setSelected((current) =>
                    current.includes(item.id)
                      ? current.filter((id) => id !== item.id)
                      : [...current, item.id],
                  )
                }
                onSave={(text) => void onItemPatch(item.id, { text })}
                onRegenerate={() => void onItemPatch(item.id, { regenerate: true })}
                onApprove={(approved) => void onItemPatch(item.id, { approved })}
                onDelete={() =>
                  void runXPostBatchActionClient({
                    batchId: active.batch.id,
                    action: "delete_selected",
                    itemIds: [item.id],
                  }).then(applyResult)
                }
                onSchedule={(scheduledFor) =>
                  void onItemPatch(item.id, { scheduledFor })
                }
              />
            ))}
          </div>
        </div>
      ) : null}
      <p className="text-xs text-[var(--foreground-muted)]">{copy.mobileSafeHint}</p>
    </section>
  );
}

function BatchItemCard(input: {
  item: XPostBatchItem;
  timeZone: string;
  selected: boolean;
  busy: boolean;
  onToggle: () => void;
  onSave: (text: string) => void;
  onRegenerate: () => void;
  onApprove: (approved: boolean) => void;
  onDelete: () => void;
  onSchedule: (iso: string) => void;
}) {
  const [text, setText] = useState(input.item.text);
  useEffect(() => {
    setText(input.item.text);
  }, [input.item.text]);

  const localValue = input.item.scheduledFor
    ? toDateTimeLocal(input.item.scheduledFor, input.timeZone)
    : "";

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={input.selected}
            onChange={input.onToggle}
          />
          {input.item.sequence} / {copy.angle}: {input.item.angle || "—"}
        </label>
        <Badge variant={statusVariant(input.item.status)}>
          {formatBatchStatus(input.item.status)}
        </Badge>
      </div>
      <textarea
        className={`${X_POST_BATCH_FIELD_CLASS} min-h-[120px] h-auto py-3`}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <p className="text-xs text-[var(--foreground-muted)]">
        {copy.charCount([...text].length, X_TWEET_MAX_CHARS)}
      </p>
      <label className="block space-y-1.5">
        <span className="text-sm">{copy.scheduledFor}</span>
        <input
          type="datetime-local"
          className={X_POST_BATCH_FIELD_CLASS}
          value={localValue}
          onChange={(event) => {
            const iso = fromDateTimeLocal(event.target.value, input.timeZone);
            if (iso) input.onSchedule(iso);
          }}
        />
        <span className="block text-xs text-[var(--foreground-muted)]">
          {formatBatchDateTime(input.item.scheduledFor, input.timeZone)}
        </span>
      </label>
      {input.item.errorMessage ? (
        <p className="text-sm text-[var(--error)]">
          {copy.error}: {input.item.errorMessage}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          className="w-full"
          disabled={input.busy}
          onClick={() => input.onSave(text)}
        >
          {copy.edit}
        </Button>
        <Button
          variant="secondary"
          className="w-full"
          disabled={input.busy}
          onClick={input.onRegenerate}
        >
          {copy.regenerate}
        </Button>
        <Button
          variant="secondary"
          className="w-full"
          disabled={input.busy}
          onClick={() =>
            input.onApprove(input.item.approvalStatus !== "approved")
          }
        >
          {input.item.approvalStatus === "approved" ? copy.unapprove : copy.approve}
        </Button>
        <Button
          variant="danger"
          className="w-full"
          disabled={input.busy}
          onClick={input.onDelete}
        >
          {copy.delete}
        </Button>
      </div>
    </Card>
  );
}

function toDateTimeLocal(iso: string, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(iso));
    const lookup = (type: string) =>
      parts.find((part) => part.type === type)?.value ?? "";
    return `${lookup("year")}-${lookup("month")}-${lookup("day")}T${lookup("hour")}:${lookup("minute")}`;
  } catch {
    return "";
  }
}

function fromDateTimeLocal(value: string, timeZone: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  return zonedWallTimeToDate(match[1], match[2], timeZone)?.toISOString() ?? null;
}
