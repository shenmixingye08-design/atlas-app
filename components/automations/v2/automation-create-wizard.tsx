"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCapabilityFormSchema } from "@/lib/automation-platform/capability-schema";
import {
  clearLocalDraftPointer,
  createAutomationV2,
  deleteAutomationDraft,
  listAutomationDrafts,
  loadLocalDraftPointer,
  runAutomationV2,
  saveAutomationDraft,
  saveLocalDraftPointer,
} from "@/lib/automation-platform/client";
import { detectInstructionConflicts } from "@/lib/automation-platform/instruction/conflict";
import { AUTOMATION_MEMORY_SCOPES } from "@/lib/automation-platform/types";
import {
  buildCreateInputFromWizard,
  createEmptyWizardDraft,
  createStepFromCapability,
  ensureNameFromCategories,
  reorderSteps,
  visibleWizardSteps,
} from "@/lib/automation-platform/wizard/builders";
import {
  resolveCategoryAvailability,
  type WorkCategoryId,
} from "@/lib/automation-platform/wizard/categories";
import {
  proposeWizardFromNaturalLanguage,
  listUnsetProposalFields,
} from "@/lib/automation-platform/wizard/nl-propose";
import {
  buildHumanSummary,
  describeExecutionPolicy,
  describeSchedule,
  describeSteps,
} from "@/lib/automation-platform/wizard/schedule-copy";
import type {
  AutomationWizardDraft,
  WizardStepId,
} from "@/lib/automation-platform/wizard/types";
import { fetchFeatureAvailability } from "@/lib/feature-flags/client";
import type { FeatureAvailabilityMap } from "@/lib/feature-flags/types";
import { fetchIntegrationCatalog } from "@/lib/integrations/client";
import { fetchXConnectionStatusClient } from "@/lib/integrations/x/post/client";
import { cn } from "@/lib/design-system/cn";

import { ComposerShell } from "./composer-shell";
import { LiveSummaryPanel } from "./live-summary-panel";
import {
  applyJobTemplate,
  JOB_TEMPLATES,
} from "@/lib/automation-platform/wizard/job-templates";

const DAY_OPTIONS = [
  { value: 0, label: "日" },
  { value: 1, label: "月" },
  { value: 2, label: "火" },
  { value: 3, label: "水" },
  { value: 4, label: "木" },
  { value: 5, label: "金" },
  { value: 6, label: "土" },
] as const;

const MEMORY_LABELS: Record<string, string> = {
  writing_style: "文体の好み",
  document_design: "文書デザイン",
  preferred_formats: "よく使う形式",
  preferred_templates: "テンプレート",
  default_recipients: "既定の送信先（手動確認必須）",
  default_storage_locations: "保存先（手動確認必須）",
  notification_preferences: "通知の好み",
  approval_preferences: "確認方針の好み",
  timezone: "タイムゾーン",
  locale: "言語・地域",
  naming_conventions: "ファイル名の付け方",
  recurring_work_preferences: "自動化の進め方",
};

type Props = {
  initialDraftId?: string | null;
  seedText?: string | null;
};

export function AutomationCreateWizard({ initialDraftId, seedText }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<AutomationWizardDraft>(() =>
    createEmptyWizardDraft({
      naturalLanguageSeed: seedText ?? "",
      freeformNotes: seedText ?? "",
    }),
  );
  const [flags, setFlags] = useState<FeatureAvailabilityMap | null>(null);
  const [connected, setConnected] = useState<Set<string>>(() => new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitLock, setSubmitLock] = useState(false);
  const [isPending, startTransition] = useTransition();
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);

  const stepIds = useMemo(() => visibleWizardSteps(draft), [draft]);
  const categories = useMemo(
    () =>
      flags
        ? resolveCategoryAvailability(flags, connected)
        : [],
    [flags, connected],
  );

  const built = useMemo(() => buildCreateInputFromWizard(draft), [draft]);

  useEffect(() => {
    void fetchFeatureAvailability()
      .then(setFlags)
      .catch(() => setErrorMessage("機能の利用状況を確認できませんでした"));

    void (async () => {
      const next = new Set<string>();
      try {
        const x = await fetchXConnectionStatusClient();
        if (x.connected) next.add("x");
      } catch {
        // leave disconnected
      }
      try {
        const catalog = await fetchIntegrationCatalog();
        for (const item of catalog.providers ?? []) {
          if (item.connectionStatus !== "connected") continue;
          if (item.id === "google_drive" || item.id === "gmail") {
            next.add("google");
          }
          if (item.id === "wordpress") next.add("wordpress");
        }
      } catch {
        // leave disconnected
      }
      setConnected(next);
    })();
  }, []);

  useEffect(() => {
    if (seedText?.trim()) {
      startTransition(() => {
        setDraft(proposeWizardFromNaturalLanguage(seedText));
      });
    }
  }, [seedText]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const drafts = await listAutomationDrafts();
        if (cancelled) return;
        const pointer = loadLocalDraftPointer();
        const targetId = initialDraftId ?? pointer?.draftId;
        const found = targetId
          ? drafts.find((item) => item.draftId === targetId)
          : drafts[0];
        if (found) {
          setDraft(found);
        }
      } catch {
        // Flag off or first visit — start fresh
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialDraftId]);

  const persistDraft = useCallback(
    async (next: AutomationWizardDraft) => {
      try {
        const result = await saveAutomationDraft(next);
        setDraft((current) =>
          current.draftId === result.draft.draftId
            ? { ...current, savedAt: result.savedAt }
            : current,
        );
        saveLocalDraftPointer({
          draftId: result.draft.draftId,
          currentStepId: next.currentStepId,
          updatedAt: result.savedAt,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "下書きの保存に失敗しました";
        setErrorMessage(message);
      }
    },
    [],
  );

  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      void persistDraft(draft);
    }, 1200);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [draft, persistDraft]);

  const goToStep = (stepId: WizardStepId) => {
    setErrorMessage(null);
    setDraft((current) => ({ ...current, currentStepId: stepId }));
  };

  const currentIndex = stepIds.indexOf(draft.currentStepId);

  const onBack = () => {
    if (currentIndex <= 0) {
      router.push("/automations");
      return;
    }
    goToStep(stepIds[currentIndex - 1]!);
  };

  const validateCurrent = (): boolean => {
    if (draft.currentStepId === "work" && draft.categoryIds.length === 0 && draft.steps.length === 0) {
      setErrorMessage("自動化したい仕事を選ぶか、希望を文章で入力してください");
      return false;
    }
    if (draft.currentStepId === "steps" && draft.steps.filter((s) => s.enabled).length === 0) {
      setErrorMessage("やることを1つ以上追加してください");
      return false;
    }
    if (draft.currentStepId === "notes") {
      const conflicts = detectInstructionConflicts({
        structuredOptions: built.input.instruction?.structuredOptions ?? {},
        freeformNotes: draft.freeformNotes,
      });
      if (conflicts.length > 0 && !draft.conflictResolution) {
        setErrorMessage("設定と備考の違いを解消してください");
        return false;
      }
    }
    if (draft.currentStepId === "review") {
      const errors = built.errors;
      if (errors.length > 0) {
        setErrorMessage(errors[0]!.message);
        goToStep(errors[0]!.stepId);
        return false;
      }
    }
    return true;
  };

  const onNext = async () => {
    if (!validateCurrent()) {
      errorRef.current?.focus();
      return;
    }

    if (draft.currentStepId === "work") {
      setDraft((current) => {
        let steps = current.steps;
        if (steps.length === 0) {
          const selected = categories
            .filter((item) => current.categoryIds.includes(item.category.id) && item.available)
            .flatMap((item) => item.availableCapabilities);
          const unique = [...new Set(selected)];
          steps = unique.map((id) => createStepFromCapability(id));
          if (steps.length === 0) {
            steps = [createStepFromCapability("orchestrate")];
          }
        }
        return {
          ...current,
          steps,
          name: ensureNameFromCategories({ ...current, steps }),
          currentStepId: "timing",
        };
      });
      return;
    }

    if (draft.currentStepId === "review") {
      await handleCreate();
      return;
    }

    const next = stepIds[currentIndex + 1];
    if (next) goToStep(next);
  };

  const handleCreate = async () => {
    if (submitLock || isSubmitting) return;
    setSubmitLock(true);
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const payload = buildCreateInputFromWizard(draft);
      if (payload.errors.length > 0) {
        setErrorMessage(payload.errors[0]!.message);
        goToStep(payload.errors[0]!.stepId);
        return;
      }
      const created = await createAutomationV2(payload.input);
      await deleteAutomationDraft(draft.draftId).catch(() => undefined);
      clearLocalDraftPointer();
      setDraft((current) => ({
        ...current,
        createdAutomationId: created.id,
        currentStepId: "complete",
        name: created.name,
      }));
    } catch (error) {
      const err = error as Error & { code?: string };
      setErrorMessage(err.message || "自動化を作成できませんでした");
    } finally {
      setIsSubmitting(false);
      setSubmitLock(false);
    }
  };

  const nextLabel = useMemo(() => {
    if (draft.currentStepId === "review") {
      return "この内容で任せる";
    }
    return "次へ";
  }, [draft.currentStepId]);

  if (flags && flags.automation_v2_enabled === false) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <h1 className="text-xl font-semibold">仕事を任せる</h1>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          いまは新しい依頼を作成できません。
        </p>
        <Button className="mt-6" onClick={() => router.push("/automations")}>
          一覧へ戻る
        </Button>
      </div>
    );
  }

  return (
    <ComposerShell
      title={draft.name || "仕事を任せる"}
      stepIds={stepIds}
      currentStepId={draft.currentStepId}
      savedAt={draft.savedAt}
      errorMessage={errorMessage}
      isSubmitting={isSubmitting || isPending}
      canGoNext={!isSubmitting}
      nextLabel={nextLabel}
      onBack={onBack}
      onNext={() => void onNext()}
      onSaveDraft={() => void persistDraft(draft)}
      summaryPanel={
        <LiveSummaryPanel
          draft={draft}
          validationMessages={built.errors.map((e) => e.message)}
        />
      }
    >
      <div ref={errorRef} tabIndex={-1} className="outline-none">
        {draft.currentStepId === "work" ? (
          <WorkStep
            draft={draft}
            categories={categories}
            onChange={setDraft}
          />
        ) : null}
        {draft.currentStepId === "timing" ? (
          <TimingStep draft={draft} onChange={setDraft} />
        ) : null}
        {draft.currentStepId === "steps" ? (
          <StepsStep draft={draft} onChange={setDraft} />
        ) : null}
        {draft.currentStepId === "details" ? (
          <DetailsStep draft={draft} onChange={setDraft} />
        ) : null}
        {draft.currentStepId === "approval" ? (
          <ApprovalStep draft={draft} onChange={setDraft} />
        ) : null}
        {draft.currentStepId === "notifications" ? (
          <NotificationsStep draft={draft} onChange={setDraft} />
        ) : null}
        {draft.currentStepId === "memory" ? (
          <MemoryStep draft={draft} onChange={setDraft} />
        ) : null}
        {draft.currentStepId === "notes" ? (
          <NotesStep draft={draft} onChange={setDraft} />
        ) : null}
        {draft.currentStepId === "review" ? (
          <ReviewStep draft={draft} onChange={setDraft} summary={built.summary} />
        ) : null}
        {draft.currentStepId === "complete" ? (
          <CompleteStep
            draft={draft}
            onView={() =>
              router.push(`/automations?id=${draft.createdAutomationId}`)
            }
            onTest={async () => {
              if (!draft.createdAutomationId) return;
              await runAutomationV2(draft.createdAutomationId);
              router.push(`/automations?id=${draft.createdAutomationId}`);
            }}
            onList={() => router.push("/automations")}
          />
        ) : null}
      </div>
    </ComposerShell>
  );
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
        {description}
      </p>
    </div>
  );
}

function ChoiceButton({
  selected,
  title,
  description,
  disabled,
  badge,
  onClick,
}: {
  selected: boolean;
  title: string;
  description?: string;
  disabled?: boolean;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "min-h-[56px] w-full rounded-2xl border px-4 py-3 text-left transition",
        "focus-ring disabled:cursor-not-allowed disabled:opacity-45",
        selected
          ? "border-accent bg-accent/10"
          : "border-[var(--border)] bg-[var(--surface)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{title}</p>
          {description ? (
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {description}
            </p>
          ) : null}
        </div>
        {badge ? (
          <span className="shrink-0 rounded-full bg-[var(--surface-muted)] px-2 py-1 text-xs">
            {badge}
          </span>
        ) : null}
      </div>
    </button>
  );
}

function WorkStep({
  draft,
  categories,
  onChange,
}: {
  draft: AutomationWizardDraft;
  categories: ReturnType<typeof resolveCategoryAvailability>;
  onChange: (draft: AutomationWizardDraft) => void;
}) {
  const [query, setQuery] = useState("");
  const popular = categories.filter((c) => c.category.popular);
  const filtered = categories.filter((c) =>
    `${c.category.label}${c.category.description}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  return (
    <div className="space-y-5">
      <SectionTitle
        title="何を任せますか？"
        description="テンプレートを選ぶか、希望を文章で書いてください。細かい調整はこのあとできます。"
      />

      <div className="space-y-2">
        <p className="text-sm font-medium">よく任せる仕事（テンプレート）</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {JOB_TEMPLATES.map((template) => (
            <ChoiceButton
              key={template.id}
              selected={draft.name === template.label}
              title={template.label}
              description={template.description}
              badge={template.group}
              onClick={() =>
                onChange(
                  applyJobTemplate(template, { draftId: draft.draftId }),
                )
              }
            />
          ))}
        </div>
      </div>

      <label className="block">
        <span className="mb-2 block text-sm font-medium">希望を文章で書く</span>
        <textarea
          className="min-h-[110px] w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-base outline-none focus-ring"
          value={draft.naturalLanguageSeed}
          placeholder="例: 毎週金曜日の18時に、売上をまとめてPowerPointを作り、PDFにしてDropboxに保存し、完了したら通知して"
          onChange={(event) =>
            onChange({
              ...draft,
              naturalLanguageSeed: event.target.value,
              freeformNotes: event.target.value,
            })
          }
        />
      </label>
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={!draft.naturalLanguageSeed.trim()}
        onClick={() =>
          onChange(proposeWizardFromNaturalLanguage(draft.naturalLanguageSeed))
        }
      >
        文章から依頼内容を作る
      </Button>
      {draft.naturalLanguageSeed && draft.steps.length > 0 ? (
        <div className="rounded-2xl bg-[var(--surface-muted)] px-4 py-3 text-sm">
          <p className="font-medium">いまの提案</p>
          <p className="mt-2 whitespace-pre-wrap">{describeSteps(draft)}</p>
          <p className="mt-2">{describeSchedule(draft)}</p>
          {listUnsetProposalFields(draft).length > 0 ? (
            <p className="mt-2 text-[var(--text-secondary)]">
              未設定:{" "}
              {listUnsetProposalFields(draft)
                .map((item) => item.label)
                .join("、")}
            </p>
          ) : null}
        </div>
      ) : null}

      <label className="block">
        <span className="mb-2 block text-sm font-medium">探す</span>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="文書、メール、投稿…"
        />
      </label>

      <div className="space-y-2">
        <p className="text-sm font-medium">よく使う項目</p>
        {(query ? filtered : popular).map((item) => (
          <ChoiceButton
            key={item.category.id}
            selected={draft.categoryIds.includes(item.category.id)}
            title={item.category.label}
            description={
              item.available
                ? item.category.description
                : item.reason ?? item.category.description
            }
            disabled={!item.available}
            badge={item.available ? undefined : "接続が必要"}
            onClick={() => {
              const exists = draft.categoryIds.includes(item.category.id);
              const categoryIds = exists
                ? draft.categoryIds.filter((id) => id !== item.category.id)
                : [...draft.categoryIds, item.category.id];
              onChange({ ...draft, categoryIds: categoryIds as WorkCategoryId[] });
            }}
          />
        ))}
      </div>

      {categories.some((item) => !item.available && item.connectHref) ? (
        <p className="text-sm text-[var(--text-secondary)]">
          使えない項目は連携が必要です。{" "}
          <Link href="/connections" className="text-accent underline">
            連携設定へ
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function TimingStep({
  draft,
  onChange,
}: {
  draft: AutomationWizardDraft;
  onChange: (draft: AutomationWizardDraft) => void;
}) {
  const frequencies = [
    { id: "daily", label: "毎日", hint: "毎日同じ時刻" },
    { id: "weekly", label: "毎週", hint: "選んだ曜日" },
    { id: "monthly", label: "毎月", hint: "毎月同じ日" },
    { id: "once", label: "特定日", hint: "指定日時に1回" },
    { id: "manual", label: "手動", hint: "必要なときに自分で開始" },
    {
      id: "condition",
      label: "条件がそろったとき",
      hint: "準備ができたら実行（いまは手動開始＋メモ）",
    },
    {
      id: "ai_propose",
      label: "提案を見てから",
      hint: "実行前に内容を確認してから進める",
    },
  ] as const;

  return (
    <div className="space-y-5">
      <SectionTitle
        title="いつ進めますか？"
        description="選ぶだけで大丈夫です。時刻はあとから変えられます。"
      />
      <div className="space-y-2">
        {frequencies.map((item) => {
          const selected =
            item.id === "manual" || item.id === "condition"
              ? draft.triggerType === "manual" &&
                (item.id !== "condition" ||
                  Boolean(draft.structuredExtras.waitForCondition))
              : item.id === "ai_propose"
                ? draft.executionMode === "review_before_run" &&
                  Boolean(draft.structuredExtras.aiProposeFirst)
                : draft.triggerType === "schedule" &&
                  draft.frequency === item.id &&
                  !draft.structuredExtras.aiProposeFirst;
          return (
            <ChoiceButton
              key={item.id}
              selected={Boolean(selected)}
              title={item.label}
              description={item.hint}
              onClick={() => {
                if (item.id === "manual") {
                  onChange({
                    ...draft,
                    triggerType: "manual",
                    structuredExtras: {
                      ...draft.structuredExtras,
                      waitForCondition: false,
                      aiProposeFirst: false,
                    },
                  });
                  return;
                }
                if (item.id === "condition") {
                  onChange({
                    ...draft,
                    triggerType: "manual",
                    structuredExtras: {
                      ...draft.structuredExtras,
                      waitForCondition: true,
                      aiProposeFirst: false,
                    },
                    freeformNotes: draft.freeformNotes.includes("条件")
                      ? draft.freeformNotes
                      : `${draft.freeformNotes}\n条件がそろったら実行`.trim(),
                  });
                  return;
                }
                if (item.id === "ai_propose") {
                  onChange({
                    ...draft,
                    triggerType: "schedule",
                    frequency: "weekly",
                    executionMode: "review_before_run",
                    structuredExtras: {
                      ...draft.structuredExtras,
                      waitForCondition: false,
                      aiProposeFirst: true,
                    },
                  });
                  return;
                }
                onChange({
                  ...draft,
                  triggerType: "schedule",
                  frequency: item.id,
                  structuredExtras: {
                    ...draft.structuredExtras,
                    waitForCondition: false,
                    aiProposeFirst: false,
                  },
                });
              }}
            />
          );
        })}
      </div>

      {draft.triggerType === "schedule" ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-2 block text-sm font-medium">時</span>
            <Input
              type="number"
              min={0}
              max={23}
              value={draft.hour}
              onChange={(event) =>
                onChange({
                  ...draft,
                  hour: Number.parseInt(event.target.value || "0", 10),
                })
              }
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium">分</span>
            <Input
              type="number"
              min={0}
              max={59}
              value={draft.minute}
              onChange={(event) =>
                onChange({
                  ...draft,
                  minute: Number.parseInt(event.target.value || "0", 10),
                })
              }
            />
          </label>
        </div>
      ) : null}

      {draft.frequency === "weekly" || draft.frequency === "custom_days" ? (
        <div className="flex flex-wrap gap-2">
          {DAY_OPTIONS.map((day) => {
            const selected = draft.daysOfWeek.includes(day.value);
            return (
              <button
                key={day.value}
                type="button"
                aria-pressed={selected}
                className={cn(
                  "min-h-[44px] min-w-[44px] rounded-full border px-3 text-sm focus-ring",
                  selected
                    ? "border-accent bg-accent/10"
                    : "border-[var(--border)]",
                )}
                onClick={() => {
                  const daysOfWeek = selected
                    ? draft.daysOfWeek.filter((value) => value !== day.value)
                    : [...draft.daysOfWeek, day.value];
                  onChange({ ...draft, daysOfWeek });
                }}
              >
                {day.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {draft.frequency === "monthly" ? (
        <label className="block">
          <span className="mb-2 block text-sm font-medium">毎月の日付</span>
          <Input
            type="number"
            min={1}
            max={31}
            value={draft.dayOfMonth}
            onChange={(event) =>
              onChange({
                ...draft,
                dayOfMonth: Number.parseInt(event.target.value || "1", 10),
              })
            }
          />
        </label>
      ) : null}

      {draft.frequency === "once" ? (
        <label className="block">
          <span className="mb-2 block text-sm font-medium">指定日時</span>
          <Input
            type="datetime-local"
            value={draft.runAt ? draft.runAt.slice(0, 16) : ""}
            onChange={(event) =>
              onChange({
                ...draft,
                runAt: event.target.value
                  ? new Date(event.target.value).toISOString()
                  : null,
              })
            }
          />
        </label>
      ) : null}

      <label className="block">
        <span className="mb-2 block text-sm font-medium">タイムゾーン</span>
        <select
          className="min-h-[44px] w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 focus-ring"
          value={draft.timezone}
          onChange={(event) =>
            onChange({ ...draft, timezone: event.target.value })
          }
        >
          <option value="Asia/Tokyo">Asia/Tokyo（日本）</option>
          <option value="UTC">UTC</option>
        </select>
      </label>

      <div className="rounded-2xl bg-[var(--surface-muted)] px-4 py-3 text-sm">
        {describeSchedule(draft)}
      </div>
      <p className="text-xs text-[var(--text-secondary)]">
        「条件が成立した時」「外部イベント」は準備中のため、いまは選べません。
      </p>
    </div>
  );
}

function StepsStep({
  draft,
  onChange,
}: {
  draft: AutomationWizardDraft;
  onChange: (draft: AutomationWizardDraft) => void;
}) {
  return (
    <div className="space-y-5">
      <SectionTitle
        title="どんな成果物にしますか？"
        description="複数選べます。順番は上から下へ進みます。"
      />
      <ul className="space-y-3">
        {draft.steps.map((step, index) => (
          <li
            key={step.id}
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-[var(--text-secondary)]">
                  {index + 1}番目
                </p>
                <p className="font-medium">{step.name}</p>
              </div>
              <label className="flex min-h-[44px] items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={step.enabled}
                  onChange={(event) => {
                    const steps = draft.steps.map((item) =>
                      item.id === step.id
                        ? { ...item, enabled: event.target.checked }
                        : item,
                    );
                    onChange({ ...draft, steps });
                  }}
                />
                有効
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={index === 0}
                onClick={() =>
                  onChange({
                    ...draft,
                    steps: reorderSteps(draft.steps, index, index - 1),
                  })
                }
              >
                上へ
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={index === draft.steps.length - 1}
                onClick={() =>
                  onChange({
                    ...draft,
                    steps: reorderSteps(draft.steps, index, index + 1),
                  })
                }
              >
                下へ
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  onChange({
                    ...draft,
                    steps: [
                      ...draft.steps,
                      {
                        ...step,
                        id: crypto.randomUUID(),
                        name: `${step.name}（コピー）`,
                      },
                    ],
                  })
                }
              >
                複製
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() =>
                  onChange({
                    ...draft,
                    steps: draft.steps.filter((item) => item.id !== step.id),
                  })
                }
              >
                削除
              </Button>
            </div>
            <label className="mt-3 flex min-h-[44px] items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={step.requiresApproval}
                onChange={(event) => {
                  const steps = draft.steps.map((item) =>
                    item.id === step.id
                      ? { ...item, requiresApproval: event.target.checked }
                      : item,
                  );
                  onChange({ ...draft, steps });
                }}
              />
              この手順の前に確認する
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {(
          [
            "word_generate",
            "excel_generate",
            "pdf_generate",
            "powerpoint_generate",
            "gmail",
            "dropbox",
            "notify",
          ] as const
        ).map((type) => (
          <Button
            key={type}
            type="button"
            size="sm"
            variant="secondary"
            onClick={() =>
              onChange({
                ...draft,
                steps: [
                  ...draft.steps,
                  createStepFromCapability(type),
                ],
              })
            }
          >
            {createStepFromCapability(type).name}を追加
          </Button>
        ))}
      </div>
    </div>
  );
}

function DetailsStep({
  draft,
  onChange,
}: {
  draft: AutomationWizardDraft;
  onChange: (draft: AutomationWizardDraft) => void;
}) {
  return (
    <div className="space-y-5">
      <SectionTitle
        title="各仕事の詳細"
        description="必要な項目だけ入力してください。送信先などは記憶だけで自動確定しません。"
      />
      {draft.steps.map((step) => {
        const schema = getCapabilityFormSchema(step.type);
        if (schema.fields.length === 0) return null;
        return (
          <section
            key={step.id}
            className="space-y-3 rounded-2xl border border-[var(--border)] p-4"
          >
            <h3 className="font-medium">{step.name}</h3>
            {schema.fields.map((field) => (
              <label key={field.key} className="block">
                <span className="mb-2 block text-sm font-medium">
                  {field.label}
                  {field.required ? " *" : ""}
                </span>
                {field.type === "boolean" ? (
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={Boolean(step.configuration[field.key])}
                    onChange={(event) => {
                      const steps = draft.steps.map((item) =>
                        item.id === step.id
                          ? {
                              ...item,
                              configuration: {
                                ...item.configuration,
                                [field.key]: event.target.checked,
                              },
                            }
                          : item,
                      );
                      onChange({ ...draft, steps });
                    }}
                  />
                ) : field.type === "select" ? (
                  <select
                    className="min-h-[44px] w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 focus-ring"
                    value={String(step.configuration[field.key] ?? "")}
                    onChange={(event) => {
                      const steps = draft.steps.map((item) =>
                        item.id === step.id
                          ? {
                              ...item,
                              configuration: {
                                ...item.configuration,
                                [field.key]: event.target.value,
                              },
                            }
                          : item,
                      );
                      onChange({ ...draft, steps });
                    }}
                  >
                    <option value="">未設定</option>
                    {field.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : field.type === "textarea" ? (
                  <textarea
                    className="min-h-[88px] w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 focus-ring"
                    value={String(step.configuration[field.key] ?? "")}
                    placeholder={field.placeholder}
                    onChange={(event) => {
                      const steps = draft.steps.map((item) =>
                        item.id === step.id
                          ? {
                              ...item,
                              configuration: {
                                ...item.configuration,
                                [field.key]: event.target.value,
                              },
                            }
                          : item,
                      );
                      onChange({ ...draft, steps });
                    }}
                  />
                ) : (
                  <Input
                    type={field.type === "number" ? "number" : "text"}
                    value={String(step.configuration[field.key] ?? "")}
                    placeholder={field.placeholder}
                    onChange={(event) => {
                      const steps = draft.steps.map((item) =>
                        item.id === step.id
                          ? {
                              ...item,
                              configuration: {
                                ...item.configuration,
                                [field.key]:
                                  field.type === "number"
                                    ? Number(event.target.value)
                                    : event.target.value,
                              },
                            }
                          : item,
                      );
                      onChange({ ...draft, steps });
                    }}
                  />
                )}
                {field.helpText ? (
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    {field.helpText}
                  </p>
                ) : null}
              </label>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function ApprovalStep({
  draft,
  onChange,
}: {
  draft: AutomationWizardDraft;
  onChange: (draft: AutomationWizardDraft) => void;
}) {
  const options = [
    {
      id: "review_before_run" as const,
      title: "毎回、実行前に確認する",
      description: "実行前に内容を通知します。承認後に開始します",
    },
    {
      id: "run_then_notify" as const,
      title: "そのまま実行し、完了後に通知する",
      description: "指定時間になると自動で実行し、完了後に通知します",
    },
    {
      id: "approve_first_then_auto" as const,
      title: "初回だけ確認する",
      description: "最初の1回だけ確認し、以降は自動です",
    },
    {
      id: "review_high_risk_only" as const,
      title: "高リスクだけ確認する",
      description: "送信・投稿・公開・削除・共有・課金の前だけ確認します",
    },
    {
      id: "review_post_only" as const,
      title: "投稿だけ確認する",
      description: "X投稿の前だけ確認します（他の高リスクも安全のため確認）",
    },
    {
      id: "review_send_only" as const,
      title: "送信だけ確認する",
      description: "メール送信の前だけ確認します（他の高リスクも安全のため確認）",
    },
    {
      id: "review_selected_steps" as const,
      title: "自分で指定した手順だけ確認する",
      description: "選んだ手順の前だけ止まります",
    },
  ];

  return (
    <div className="space-y-5">
      <SectionTitle
        title="実行前の確認"
        description="投稿・メール送信・公開など安全上必要な操作は、自動設定でも確認が必須になる場合があります。"
      />
      <div className="space-y-2">
        {options.map((option) => (
          <ChoiceButton
            key={option.id}
            selected={draft.executionMode === option.id}
            title={option.title}
            description={option.description}
            onClick={() => onChange({ ...draft, executionMode: option.id })}
          />
        ))}
      </div>
      <p className="rounded-2xl bg-[var(--surface-muted)] px-4 py-3 text-sm">
        {describeExecutionPolicy(draft)}
      </p>
    </div>
  );
}

function NotificationsStep({
  draft,
  onChange,
}: {
  draft: AutomationWizardDraft;
  onChange: (draft: AutomationWizardDraft) => void;
}) {
  const noneSelected =
    !draft.notifyOnSuccess &&
    !draft.notifyOnFailure &&
    !draft.notifyBeforeRun &&
    !draft.notifyOnNeedsInput;

  return (
    <div className="space-y-5">
      <SectionTitle
        title="どう知らせますか？"
        description="完了・失敗・承認のどれを知らせるか選ぶだけです。"
      />
      <ChoiceButton
        selected={draft.notifyOnSuccess}
        title="完了を知らせる"
        description="終わったらお知らせします"
        onClick={() =>
          onChange({ ...draft, notifyOnSuccess: !draft.notifyOnSuccess })
        }
      />
      <ChoiceButton
        selected={draft.notifyOnFailure}
        title="失敗を知らせる"
        description="うまくいかなかったらお知らせします"
        onClick={() =>
          onChange({ ...draft, notifyOnFailure: !draft.notifyOnFailure })
        }
      />
      <ChoiceButton
        selected={
          draft.executionMode === "review_before_run" ||
          draft.selectedApprovalStepIds.length > 0
        }
        title="承認が必要"
        description="進める前にあなたが確認します"
        onClick={() =>
          onChange({
            ...draft,
            executionMode:
              draft.executionMode === "review_before_run"
                ? "run_then_notify"
                : "review_before_run",
            notifyOnNeedsInput: true,
          })
        }
      />
      <ChoiceButton
        selected={noneSelected}
        title="通知なし"
        description="履歴から結果を見られます"
        onClick={() =>
          onChange({
            ...draft,
            notifyBeforeRun: false,
            notifyOnSuccess: false,
            notifyOnFailure: false,
            notifyOnNeedsInput: false,
            notificationChannels: ["in_app"],
          })
        }
      />
    </div>
  );
}

function MemoryStep({
  draft,
  onChange,
}: {
  draft: AutomationWizardDraft;
  onChange: (draft: AutomationWizardDraft) => void;
}) {
  return (
    <div className="space-y-5">
      <SectionTitle
        title="覚え方"
        description="今回だけか、次からも使うか選んでください。"
      />
      <ChoiceButton
        selected={draft.memoryEnabled}
        title="今回の設定を覚える"
        description="次からも同じ好みで進めます"
        onClick={() =>
          onChange({
            ...draft,
            memoryEnabled: true,
            memoryAllowedScopes:
              draft.memoryAllowedScopes.length > 0
                ? draft.memoryAllowedScopes
                : [
                    "writing_style",
                    "document_design",
                    "preferred_formats",
                    "recurring_work_preferences",
                  ],
          })
        }
      />
      <ChoiceButton
        selected={!draft.memoryEnabled}
        title="今回だけ"
        description="この依頼だけの設定にします"
        onClick={() => onChange({ ...draft, memoryEnabled: false })}
      />
      <ChoiceButton
        selected={draft.memoryEnabled && draft.memoryAllowedScopes.length > 0}
        title="既存の好みを使う"
        description="すでに覚えている内容を使います"
        onClick={() =>
          onChange({
            ...draft,
            memoryEnabled: true,
            memoryAllowedScopes:
              draft.memoryAllowedScopes.length > 0
                ? draft.memoryAllowedScopes
                : [
                    "writing_style",
                    "document_design",
                    "preferred_formats",
                    "recurring_work_preferences",
                  ],
          })
        }
      />
      <label className="flex min-h-[48px] items-center gap-3">
        <input
          type="checkbox"
          checked={draft.memoryEnabled}
          onChange={(event) =>
            onChange({ ...draft, memoryEnabled: event.target.checked })
          }
        />
        <span>くわしい好みの範囲を選ぶ</span>
      </label>
      {draft.memoryEnabled ? (
        <div className="space-y-2">
          {AUTOMATION_MEMORY_SCOPES.map((scope) => {
            const allowed = draft.memoryAllowedScopes.includes(scope);
            const denied = draft.memoryDeniedScopes.includes(scope);
            return (
              <div
                key={scope}
                className="rounded-2xl border border-[var(--border)] px-4 py-3"
              >
                <p className="font-medium">
                  {MEMORY_LABELS[scope] ?? scope}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={allowed ? "primary" : "secondary"}
                    onClick={() =>
                      onChange({
                        ...draft,
                        memoryAllowedScopes: [
                          ...draft.memoryAllowedScopes.filter((s) => s !== scope),
                          scope,
                        ],
                        memoryDeniedScopes: draft.memoryDeniedScopes.filter(
                          (s) => s !== scope,
                        ),
                      })
                    }
                  >
                    使う
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={denied ? "primary" : "secondary"}
                    onClick={() =>
                      onChange({
                        ...draft,
                        memoryDeniedScopes: [
                          ...draft.memoryDeniedScopes.filter((s) => s !== scope),
                          scope,
                        ],
                        memoryAllowedScopes: draft.memoryAllowedScopes.filter(
                          (s) => s !== scope,
                        ),
                      })
                    }
                  >
                    使わない
                  </Button>
                </div>
              </div>
            );
          })}
          <Link href="/settings/memory" className="text-sm text-accent underline">
            記憶設定画面を開く
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function NotesStep({
  draft,
  onChange,
}: {
  draft: AutomationWizardDraft;
  onChange: (draft: AutomationWizardDraft) => void;
}) {
  const conflicts = detectInstructionConflicts({
    structuredOptions: {
      generatePdf: draft.steps.some((s) => s.type === "pdf_generate" && s.enabled),
      generateExcel: draft.steps.some(
        (s) => s.type === "excel_generate" && s.enabled,
      ),
      postToX: draft.steps.some((s) => s.type === "x_post" && s.enabled),
      sendEmail: draft.steps.some(
        (s) => s.type === "gmail" && s.configuration.mode === "send",
      ),
    },
    freeformNotes: draft.freeformNotes,
  });

  return (
    <div className="space-y-5">
      <SectionTitle
        title="くわしい希望"
        description="箇条書き・枚数・色など、自然な言葉で書いてください。"
      />
      <label className="block">
        <span className="mb-2 block text-sm font-medium">備考</span>
        <textarea
          className="min-h-[160px] w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-base focus-ring"
          value={draft.freeformNotes}
          maxLength={2000}
          placeholder="例: 社長向けなので短く。青系のデザイン。失敗時はメールでも知らせて。"
          onChange={(event) =>
            onChange({ ...draft, freeformNotes: event.target.value })
          }
        />
        <p className="mt-2 text-xs text-[var(--text-secondary)]">
          {draft.freeformNotes.length}/2000
        </p>
      </label>
      {conflicts.length > 0 ? (
        <div
          role="alert"
          className="space-y-3 rounded-2xl border border-[var(--warning)]/40 bg-[var(--surface-muted)] px-4 py-3"
        >
          <p className="font-medium">設定と備考に違いがあります</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {conflicts.map((conflict) => (
              <li key={conflict.field}>{conflict.message}</li>
            ))}
          </ul>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant={
                draft.conflictResolution === "prefer_structured"
                  ? "primary"
                  : "secondary"
              }
              onClick={() =>
                onChange({ ...draft, conflictResolution: "prefer_structured" })
              }
            >
              設定を優先
            </Button>
            <Button
              type="button"
              variant={
                draft.conflictResolution === "prefer_notes"
                  ? "primary"
                  : "secondary"
              }
              onClick={() =>
                onChange({ ...draft, conflictResolution: "prefer_notes" })
              }
            >
              備考を優先
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                onChange({ ...draft, conflictResolution: null, currentStepId: "steps" })
              }
            >
              内容を編集
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ReviewStep({
  draft,
  onChange,
  summary,
}: {
  draft: AutomationWizardDraft;
  onChange: (draft: AutomationWizardDraft) => void;
  summary: string;
}) {
  return (
    <div className="space-y-5">
      <SectionTitle
        title="この内容で任せます"
        description="そのままでよければ「任せる」。違うところはここで直せます（戻らなくて大丈夫です）。"
      />
      <label className="block">
        <span className="mb-2 block text-sm font-medium">依頼の名前</span>
        <Input
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-medium">内容のまとめ（編集可）</span>
        <textarea
          className="min-h-[140px] w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-sm leading-relaxed outline-none focus-ring"
          value={draft.description || summary || buildHumanSummary(draft)}
          onChange={(event) =>
            onChange({ ...draft, description: event.target.value })
          }
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-medium">くわしい希望</span>
        <textarea
          className="min-h-[96px] w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm outline-none focus-ring"
          value={draft.freeformNotes}
          placeholder="例: 箇条書き、A4一枚、青系"
          onChange={(event) =>
            onChange({ ...draft, freeformNotes: event.target.value })
          }
        />
      </label>
      <div className="space-y-2 text-sm text-[var(--text-secondary)]">
        <p>タイミング: {describeSchedule(draft)}</p>
        <p>成果物: {describeSteps(draft)}</p>
        <p>確認: {describeExecutionPolicy(draft)}</p>
        <p>
          覚え方:{" "}
          {draft.memoryEnabled ? "好みを使う / 覚える" : "今回だけ"}
        </p>
      </div>
      <label className="flex min-h-[48px] items-center gap-3 rounded-2xl border border-[var(--border)] px-4">
        <input
          type="checkbox"
          checked={draft.activateOnCreate}
          onChange={(event) =>
            onChange({ ...draft, activateOnCreate: event.target.checked })
          }
        />
        <span>すぐに開始する（予定どおり進める）</span>
      </label>
    </div>
  );
}

function CompleteStep({
  draft,
  onView,
  onTest,
  onList,
}: {
  draft: AutomationWizardDraft;
  onView: () => void;
  onTest: () => Promise<void>;
  onList: () => void;
}) {
  const [testing, setTesting] = useState(false);
  return (
    <div className="space-y-5 py-6">
      <SectionTitle
        title="任せました"
        description={
          draft.activateOnCreate
            ? "予定どおり進めます。"
            : "下書きとして保存しました。一覧から開始できます。"
        }
      />
      <div className="rounded-2xl bg-[var(--surface-muted)] px-4 py-3 text-sm">
        <p className="font-medium">{draft.name}</p>
        <p className="mt-2">{describeSchedule(draft)}</p>
        <p className="mt-2">{describeExecutionPolicy(draft)}</p>
      </div>
      <div className="flex flex-col gap-3">
        <Button type="button" onClick={onView}>
          自動化の詳細を見る
        </Button>
        <Button
          type="button"
          variant="secondary"
          isLoading={testing}
          onClick={() => {
            setTesting(true);
            void onTest().finally(() => setTesting(false));
          }}
        >
          今すぐテスト実行
        </Button>
        <Button type="button" variant="ghost" onClick={onList}>
          一覧へ戻る
        </Button>
      </div>
    </div>
  );
}
