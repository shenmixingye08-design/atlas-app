"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import {
  getUploadedAttachmentIds,
  ImageAttachmentPicker,
  type LocalImageDraft,
} from "@/components/vision/image-attachment-picker";
import { VisionStatus } from "@/components/vision/vision-status";
import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";
import { QUICK_REQUEST_PRESETS } from "@/lib/workspace/quick-request-presets";

export type RequestExecutionMode = "once" | "recurring" | "delegate";
export type RequestPriority = "low" | "normal" | "high";

export type WorkRequestSubmitPayload = {
  assignment: string;
  metadata: Readonly<Record<string, unknown>>;
};

type WorkRequestFormProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (payload: WorkRequestSubmitPayload) => void;
  isLoading: boolean;
};

type AttachmentKind =
  | "photo"
  | "pdf"
  | "video"
  | "word"
  | "excel"
  | "powerpoint"
  | "other";

type AttachmentItem = {
  id: string;
  kind: AttachmentKind;
  file: File;
};

const ATTACHMENT_OPTIONS: {
  kind: AttachmentKind;
  label: string;
  icon: string;
  accept: string;
  contentReadable: boolean;
}[] = [
  { kind: "photo", label: "画像", icon: "📷", accept: "image/*", contentReadable: false },
  { kind: "pdf", label: "PDF", icon: "📄", accept: "application/pdf,.pdf", contentReadable: false },
  {
    kind: "word",
    label: "Word",
    icon: "📝",
    accept:
      ".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    contentReadable: false,
  },
  {
    kind: "excel",
    label: "Excel",
    icon: "📊",
    accept:
      ".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    contentReadable: false,
  },
  {
    kind: "powerpoint",
    label: "PowerPoint",
    icon: "📑",
    accept:
      ".ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation",
    contentReadable: false,
  },
  { kind: "video", label: "動画", icon: "🎬", accept: "video/*", contentReadable: false },
  {
    kind: "other",
    label: "CSV",
    icon: "📑",
    accept: ".csv,text/csv",
    contentReadable: false,
  },
];

const EXECUTION_OPTIONS: {
  value: RequestExecutionMode;
  label: string;
  hint: string;
}[] = [
  {
    value: "once",
    label: "今回だけ",
    hint: "この依頼を一度だけ進めます",
  },
  {
    value: "recurring",
    label: "今後も同じように実行",
    hint: "同じ流れで繰り返し進められるようにします",
  },
  {
    value: "delegate",
    label: "AI秘書に任せる",
    hint: "進め方はMINERVOTにお任せください",
  },
];

const PRIORITY_OPTIONS: { value: RequestPriority; label: string }[] = [
  { value: "low", label: "低" },
  { value: "normal", label: "通常" },
  { value: "high", label: "高" },
];

const ATTACH_QUERY_MAP: Record<string, AttachmentKind> = {
  photo: "photo",
  pdf: "pdf",
  video: "video",
  file: "other",
  text: "other",
  word: "word",
  excel: "excel",
  powerpoint: "powerpoint",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildAssignmentText(input: {
  text: string;
  executionMode: RequestExecutionMode;
  priority: RequestPriority;
  deadline: string;
  imageCount: number;
  nonImageCount: number;
}): string {
  const lines = [input.text.trim()];

  const executionLabel =
    EXECUTION_OPTIONS.find((item) => item.value === input.executionMode)?.label ??
    input.executionMode;
  const priorityLabel =
    PRIORITY_OPTIONS.find((item) => item.value === input.priority)?.label ??
    input.priority;

  lines.push("");
  lines.push(`【実行方法】${executionLabel}`);
  lines.push(`【優先度】${priorityLabel}`);

  if (input.deadline) {
    lines.push(`【期限】${input.deadline.replace("T", " ")}`);
  }

  // Never put filenames into the assignment — Vision uses attachmentIds server-side.
  if (input.imageCount > 0) {
    lines.push(`【添付画像】${input.imageCount}枚（サーバー側で内容を解析します）`);
  }
  if (input.nonImageCount > 0) {
    lines.push(`【その他添付】${input.nonImageCount}件`);
  }

  return lines.join("\n");
}

function isImageLikeFile(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type.startsWith("image/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext ?? "");
}

export function WorkRequestForm({
  value,
  onChange,
  onSubmit,
  isLoading,
}: WorkRequestFormProps) {
  const searchParams = useSearchParams();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingKindRef = useRef<AttachmentKind>("other");

  const [executionMode, setExecutionMode] =
    useState<RequestExecutionMode>("once");
  const [priority, setPriority] = useState<RequestPriority>("normal");
  const [deadline, setDeadline] = useState("");
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [imageDrafts, setImageDrafts] = useState<LocalImageDraft[]>([]);
  const [visionDetectedType, setVisionDetectedType] = useState<string>("");
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const imagePickerAddRef = useRef<((files: FileList | File[]) => void) | null>(
    null,
  );

  const addFiles = useCallback((files: FileList | File[], kind: AttachmentKind) => {
    const list = Array.from(files);
    if (list.length === 0) return;

    // Images must go through ImageAttachmentPicker so attachmentIds are created.
    const imageFiles = list.filter(isImageLikeFile);
    const otherFiles = list.filter((file) => !isImageLikeFile(file));
    if (imageFiles.length > 0) {
      if (imagePickerAddRef.current) {
        imagePickerAddRef.current(imageFiles);
      } else {
        setAttachmentError(
          "画像は上の「画像を添付」から選んでください。ファイル名だけでは解析できません。",
        );
      }
    }
    if (otherFiles.length === 0) return;

    setAttachments((prev) => [
      ...prev,
      ...otherFiles.map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
        kind: kind === "photo" ? "other" : kind,
        file,
      })),
    ]);
  }, []);

  const openFilePicker = useCallback((kind: AttachmentKind) => {
    pendingKindRef.current = kind;
    const option = ATTACHMENT_OPTIONS.find((item) => item.kind === kind);
    if (fileInputRef.current) {
      fileInputRef.current.accept = option?.accept ?? "*/*";
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }, []);

  useEffect(() => {
    const attach = searchParams.get("attach");
    if (!attach) return;
    const kind = ATTACH_QUERY_MAP[attach];
    if (!kind) {
      if (attach === "text") {
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
      return;
    }
    openFilePicker(kind);
  }, [searchParams, openFilePicker]);

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (isLoading) return;
    addFiles(event.dataTransfer.files, "other");
  };

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || isLoading || isUploadingImages) return;
    setAttachmentError(null);

    const uploading = imageDrafts.some(
      (item) => item.status === "uploading" || item.status === "pending",
    );
    if (uploading) {
      setIsUploadingImages(true);
      return;
    }
    setIsUploadingImages(false);

    const failedImages = imageDrafts.filter((item) => item.status === "failed");
    if (failedImages.length > 0) {
      setAttachmentError("画像のアップロードに失敗しています。撮り直すか別の画像を選んでください。");
      return;
    }

    const attachmentIds = getUploadedAttachmentIds(imageDrafts);
    if (imageDrafts.length > 0 && attachmentIds.length === 0) {
      setAttachmentError(
        "画像添付エラー: attachmentId がありません。画像を選び直してください。",
      );
      return;
    }

    const imageMeta = imageDrafts
      .filter((item) => item.status === "uploaded" && item.uploaded)
      .map((item) => ({
        attachmentId: item.uploaded!.id,
        id: item.uploaded!.id,
        kind: "photo" as const,
        mimeType: item.uploaded!.mimeType,
        size: item.uploaded!.originalBytes,
        visionStatus: "uploaded",
      }));

    const assignment = buildAssignmentText({
      text: trimmed,
      executionMode,
      priority,
      deadline,
      imageCount: attachmentIds.length,
      nonImageCount: attachments.length,
    });

    onSubmit({
      assignment,
      metadata: {
        requestUi: "secretary_v1",
        executionPreference: executionMode,
        priority,
        ...(deadline ? { deadline } : {}),
        ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
        ...(visionDetectedType
          ? { visionDetectedType }
          : {}),
        attachments: [
          ...imageMeta,
          ...attachments.map((item) => ({
            kind: item.kind,
            mimeType: item.file.type || null,
            size: item.file.size,
          })),
        ],
        skipWorkMemory: false,
        requireVisionSuccess: attachmentIds.length > 0,
      },
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const imagesBusy = imageDrafts.some(
    (item) => item.status === "uploading" || item.status === "pending",
  );
  const imagesFailed = imageDrafts.some((item) => item.status === "failed");
  const canSubmit =
    value.trim().length > 0 && !isLoading && !imagesBusy && !imagesFailed;

  const attachmentSummary = useMemo(() => {
    const total = attachments.length + imageDrafts.length;
    if (total === 0) return null;
    return `${total}件の資料を添付中`;
  }, [attachments.length, imageDrafts.length]);

  return (
    <div className="space-y-10 sm:space-y-12">
      <header className="space-y-3">
        <p className="text-sm font-medium text-accent">{ui.brand}</p>
        <h1 className="text-display text-foreground">{ui.work.title}</h1>
        <p className="text-body max-w-2xl text-[var(--text-secondary)]">
          {ui.work.intro}
        </p>
      </header>

      <section className="space-y-4" aria-labelledby="work-templates-heading">
        <div className="space-y-1">
          <h2
            id="work-templates-heading"
            className="text-lg font-semibold text-foreground sm:text-xl"
          >
            {ui.work.templatesLabel}
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            {ui.work.templatesHint}
          </p>
        </div>
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
          role="group"
          aria-label={ui.work.templatesLabel}
        >
          {QUICK_REQUEST_PRESETS.map((preset) => {
            const selected = value.trim() === preset.prompt.trim();
            return (
              <button
                key={preset.id}
                type="button"
                disabled={isLoading}
                onClick={() => {
                  onChange(preset.prompt);
                  requestAnimationFrame(() => {
                    const textarea = textareaRef.current;
                    if (!textarea) return;
                    textarea.focus();
                    const len = preset.prompt.length;
                    textarea.setSelectionRange(len, len);
                  });
                }}
                className={cn(
                  "touch-target flex min-h-[72px] items-center justify-center rounded-[20px] border px-3 py-4 text-center text-sm font-medium transition-all focus-ring sm:min-h-[80px] sm:text-base",
                  selected
                    ? "border-accent bg-accent/10 text-foreground shadow-[var(--shadow-sm)]"
                    : "border-[var(--border-subtle)] bg-[var(--card)] text-foreground hover:border-accent/40 hover:shadow-[var(--shadow-sm)]",
                )}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">
            {ui.work.requestContentLabel}
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            {ui.work.requestContentHint}
          </p>
        </div>

        <Card padding="lg" className="bg-[var(--card)] shadow-[var(--shadow-md)]">
          <Textarea
            ref={textareaRef}
            id="work-request"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={ui.work.placeholder}
            rows={8}
            disabled={isLoading}
            aria-label={ui.work.placeholder}
            className="min-h-[200px] resize-y border-none bg-transparent px-0 py-0 text-lg leading-relaxed shadow-none focus:ring-0"
          />
        </Card>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">
            画像を添付（AIが内容を理解します）
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            レシート・請求書・表・営業資料・手書きメモなどを添付できます。選択しただけでは実行されません。
          </p>
        </div>
        <ImageAttachmentPicker
          value={imageDrafts}
          onChange={setImageDrafts}
          disabled={isLoading}
          preferReadableText
          addFilesRef={imagePickerAddRef}
        />
        {attachmentError && (
          <p className="text-sm text-[var(--error)]">{attachmentError}</p>
        )}
        {(imagesBusy || isUploadingImages) && (
          <VisionStatus analyzing status="uploading" />
        )}
        {imageDrafts.length > 0 && (
          <label className="block text-xs text-[var(--text-secondary)]">
            画像の種類（任意・誤判定時に変更）
            <select
              className="ml-2 rounded border border-[var(--border-subtle)] bg-transparent px-2 py-1"
              value={visionDetectedType}
              onChange={(event) => setVisionDetectedType(event.target.value)}
              disabled={isLoading}
            >
              <option value="">自動判定</option>
              <option value="receipt">レシート</option>
              <option value="invoice">請求書</option>
              <option value="sales_material">営業資料</option>
              <option value="table">表</option>
              <option value="handwritten_note">手書きメモ</option>
              <option value="business_card">名刺</option>
              <option value="general_photo">一般写真</option>
            </select>
          </label>
        )}
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">
            {ui.work.attachmentsLabel}
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            {ui.work.attachmentsHint}
          </p>
        </div>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            if (!isLoading) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "rounded-[var(--radius-2xl)] border border-dashed p-4 transition-colors sm:p-6",
            isDragging
              ? "border-accent bg-accent/5"
              : "border-[var(--border-subtle)] bg-[var(--surface-muted)]/40",
          )}
        >
          <p className="mb-4 text-center text-sm text-[var(--text-secondary)]">
            {ui.work.dropHint}
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {ATTACHMENT_OPTIONS.filter((option) => option.kind !== "photo").map(
              (option) => (
              <button
                key={option.kind}
                type="button"
                disabled={isLoading}
                onClick={() => openFilePicker(option.kind)}
                className="touch-target flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-[var(--radius-xl)] bg-[var(--card)] px-3 py-4 text-sm shadow-[var(--shadow-md)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-lg)] focus-ring disabled:opacity-40"
              >
                <span className="text-2xl" aria-hidden>
                  {option.icon}
                </span>
                <span className="font-medium text-foreground">{option.label}</span>
              </button>
            ),
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            onChange={(event) => {
              if (event.target.files) {
                addFiles(event.target.files, pendingKindRef.current);
              }
            }}
          />
        </div>

        {attachments.length > 0 && (
          <Card padding="md" className="space-y-3 bg-[var(--card)]">
            <p className="text-sm font-medium text-foreground">{attachmentSummary}</p>
            <ul className="space-y-2">
              {attachments.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {item.file.name}
                    </p>
                    <p className="text-caption text-[var(--text-secondary)]">
                      {ATTACHMENT_OPTIONS.find((option) => option.kind === item.kind)
                        ?.label ?? item.kind}{" "}
                      · {formatFileSize(item.file.size)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => removeAttachment(item.id)}
                    className="shrink-0 rounded-full px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--card)] hover:text-foreground focus-ring"
                  >
                    {ui.actions.remove}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">
          {ui.work.executionModeLabel}
        </h2>
        <Card padding="md" className="space-y-2 bg-[var(--card)]">
          {EXECUTION_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-[var(--radius-xl)] px-4 py-3 transition-colors",
                executionMode === option.value
                  ? "bg-accent/5"
                  : "hover:bg-[var(--surface-muted)]",
              )}
            >
              <input
                type="radio"
                name="execution-mode"
                value={option.value}
                checked={executionMode === option.value}
                disabled={isLoading}
                onChange={() => setExecutionMode(option.value)}
                className="mt-1 h-4 w-4 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-base font-medium text-foreground">
                  {option.label}
                </span>
                <span className="mt-0.5 block text-sm text-[var(--text-secondary)]">
                  {option.hint}
                </span>
              </span>
            </label>
          ))}
        </Card>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">
          {ui.work.priorityLabel}
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {PRIORITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={isLoading}
              onClick={() => setPriority(option.value)}
              className={cn(
                "touch-target min-h-[52px] rounded-[var(--radius-xl)] border text-base font-medium transition-colors focus-ring",
                priority === option.value
                  ? "border-accent bg-accent text-white"
                  : "border-[var(--border-subtle)] bg-[var(--card)] text-foreground hover:border-accent/40",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">
          {ui.work.deadlineLabel}
        </h2>
        <Card padding="md" className="bg-[var(--card)]">
          <input
            type="datetime-local"
            value={deadline}
            disabled={isLoading}
            onChange={(event) => setDeadline(event.target.value)}
            className="h-12 w-full rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-4 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30"
            aria-label={ui.work.deadlineLabel}
          />
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {ui.work.deadlineHint}
          </p>
        </Card>
      </section>

      <div className="pt-2">
        <Button
          variant="primary"
          size="lg"
          onClick={handleSubmit}
          disabled={!canSubmit}
          isLoading={isLoading}
          className="h-14 w-full rounded-full text-base sm:h-16 sm:text-lg"
        >
          {ui.work.submitRequest}
        </Button>
        <p className="mt-3 text-center text-caption text-[var(--text-secondary)]">
          {ui.work.submitHint}
        </p>
      </div>
    </div>
  );
}
