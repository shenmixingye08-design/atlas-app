"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";
import {
  classifyUploads,
  type UploadClassification,
  type UploadIntent,
} from "@/lib/home/upload-intent";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
};

type PendingFile = {
  id: string;
  file: File;
};

type Phase = "idle" | "understanding" | "autostart" | "choose";

const AUTO_START_DELAY_MS = 1600;

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function makeFileId(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function SecretaryUploadHero() {
  const router = useRouter();
  const t = ui.uploadHome;

  const [files, setFiles] = useState<PendingFile[]>([]);
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [classification, setClassification] =
    useState<UploadClassification | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const dragDepthRef = useRef(0);
  const autoStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setVoiceSupported(Boolean(getSpeechRecognitionCtor()));
    return () => {
      recognitionRef.current?.stop();
      if (autoStartTimerRef.current) clearTimeout(autoStartTimerRef.current);
    };
  }, []);

  const startWork = useCallback(
    (assignment: string) => {
      const trimmed = assignment.trim();
      if (!trimmed) return;
      router.push(
        `/commander?assignment=${encodeURIComponent(trimmed)}&autostart=1`,
      );
    },
    [router],
  );

  const cancelAutoStart = useCallback(() => {
    if (autoStartTimerRef.current) {
      clearTimeout(autoStartTimerRef.current);
      autoStartTimerRef.current = null;
    }
    setPhase("idle");
    setClassification(null);
    setFiles([]);
  }, []);

  const handleFiles = useCallback(
    (list: FileList | File[]) => {
      const incoming = Array.from(list);
      if (incoming.length === 0) return;

      const pending = incoming.map((file) => ({ id: makeFileId(file), file }));
      setFiles(pending);
      setPhase("understanding");

      const result = classifyUploads(
        pending.map((item) => ({
          name: item.file.name,
          type: item.file.type || null,
        })),
      );
      if (!result) {
        setPhase("idle");
        return;
      }
      setClassification(result);

      const fileNames = pending.map((item) => item.file.name);
      if (result.confidence === "high") {
        setPhase("autostart");
        autoStartTimerRef.current = setTimeout(() => {
          startWork(result.intent.buildAssignment(fileNames));
        }, AUTO_START_DELAY_MS);
      } else {
        setPhase("choose");
      }
    },
    [startWork],
  );

  const chooseIntent = useCallback(
    (intent: UploadIntent) => {
      const fileNames = files.map((item) => item.file.name);
      startWork(intent.buildAssignment(fileNames));
    },
    [files, startWork],
  );

  const sendText = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    startWork(trimmed);
  }, [startWork, text]);

  const toggleVoice = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setVoiceHint(t.voiceUnsupported);
      return;
    }
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }
    const recognition = new Ctor();
    recognition.lang = "ja-JP";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let chunk = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        chunk += event.results[i]?.[0]?.transcript ?? "";
      }
      if (chunk) {
        setText((prev) => {
          const base = prev.trim();
          return base ? `${base} ${chunk.trim()}` : chunk.trim();
        });
      }
    };
    recognition.onerror = () => {
      setListening(false);
      setVoiceHint(t.voiceError);
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    setVoiceHint(null);
    setListening(true);
    recognition.start();
  }, [listening, t.voiceError, t.voiceUnsupported]);

  const busy = phase === "understanding" || phase === "autostart";

  return (
    <section aria-labelledby="upload-hero-title" className="animate-fade-up">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-semibold tracking-[0.2em] text-accent">
          {t.brand}
        </p>
        <h1
          id="upload-hero-title"
          className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl"
        >
          {t.title}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[var(--foreground-muted)] sm:text-base">
          {t.subtitle}
        </p>
      </div>

      <div
        className="relative mx-auto mt-8 max-w-2xl"
        onDragEnter={(event) => {
          event.preventDefault();
          dragDepthRef.current += 1;
          setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
          if (dragDepthRef.current === 0) setDragging(false);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          dragDepthRef.current = 0;
          setDragging(false);
          if (event.dataTransfer.files?.length) {
            handleFiles(event.dataTransfer.files);
          }
        }}
      >
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) handleFiles(event.target.files);
            event.target.value = "";
          }}
        />

        {phase === "idle" || phase === "understanding" ? (
          <div
            className={cn(
              "rounded-[28px] border-2 border-dashed bg-[var(--card)] px-6 py-10 text-center shadow-[var(--shadow-md)] transition-all duration-300 sm:px-10 sm:py-14",
              dragging
                ? "border-accent bg-accent/[0.05] ring-2 ring-accent/20"
                : "border-[var(--border-subtle)]",
            )}
          >
            <div
              className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent/10 text-accent"
              aria-hidden
            >
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none">
                <path
                  d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </div>

            {phase === "understanding" ? (
              <p className="mt-5 text-base font-medium text-accent">
                {t.understanding}
              </p>
            ) : (
              <>
                <p className="mt-5 text-lg font-semibold text-foreground">
                  {dragging ? t.dropActive : t.dropzoneTitle}
                </p>
                <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                  {t.dropzoneHint}
                </p>
              </>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              <Button
                variant="primary"
                size="md"
                onClick={() => imageInputRef.current?.click()}
              >
                {t.selectImage}
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => cameraInputRef.current?.click()}
              >
                {t.takePhoto}
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => fileInputRef.current?.click()}
              >
                {t.selectFile}
              </Button>
            </div>
          </div>
        ) : null}

        {phase === "autostart" && classification ? (
          <div className="rounded-[28px] border border-accent/30 bg-accent/[0.05] px-6 py-10 text-center shadow-[var(--shadow-md)] sm:px-10">
            <p className="text-4xl" aria-hidden>
              {classification.intent.emoji}
            </p>
            <p className="mt-4 text-lg font-semibold text-foreground">
              {classification.intent.statement}
            </p>
            <p className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-accent">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
              {t.autoStarting}
            </p>
            <div className="mt-6">
              <Button variant="ghost" size="sm" onClick={cancelAutoStart}>
                {t.autoStartCancel}
              </Button>
            </div>
          </div>
        ) : null}

        {phase === "choose" && classification ? (
          <div className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--card)] px-6 py-8 shadow-[var(--shadow-md)] sm:px-10">
            <p className="text-center text-4xl" aria-hidden>
              {classification.intent.emoji}
            </p>
            <p className="mt-4 text-center text-lg font-semibold text-foreground">
              {t.chooseTitle}
            </p>
            <p className="mt-1 text-center text-sm text-[var(--foreground-muted)]">
              {t.chooseHint}
            </p>
            <div className="mt-6 space-y-3">
              {classification.alternatives.map((intent) => (
                <button
                  key={intent.id}
                  type="button"
                  onClick={() => chooseIntent(intent)}
                  className="flex w-full items-center gap-3 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--background-subtle)]/50 px-5 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[var(--shadow-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                >
                  <span className="text-2xl" aria-hidden>
                    {intent.emoji}
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {intent.optionLabel}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-5 text-center">
              <Button variant="ghost" size="sm" onClick={cancelAutoStart}>
                {t.otherFile}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {/* 文章・音声でも送れる（副導線） */}
      <div className="mx-auto mt-4 max-w-2xl">
        <label className="sr-only" htmlFor="upload-hero-text">
          {t.textLabel}
        </label>
        <div className="flex flex-col gap-3 rounded-[24px] border border-[var(--border-subtle)] bg-[var(--card)] p-3 shadow-[var(--shadow-sm)] sm:flex-row sm:items-end">
          <textarea
            id="upload-hero-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={1}
            placeholder={t.textPlaceholder}
            disabled={busy}
            className="min-h-[48px] flex-1 resize-none rounded-[16px] bg-transparent px-3 py-3 text-sm text-foreground outline-none placeholder:text-[var(--foreground-muted)] sm:text-base"
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                sendText();
              }
            }}
          />
          <div className="flex items-center gap-2">
            <Button
              variant={listening ? "primary" : "secondary"}
              size="sm"
              onClick={toggleVoice}
              disabled={(!voiceSupported && !listening) || busy}
              aria-pressed={listening}
            >
              {listening ? t.voiceListening : t.voiceInput}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={sendText}
              disabled={!text.trim() || busy}
            >
              {t.send}
            </Button>
          </div>
        </div>
        {voiceHint && (
          <p className="mt-2 text-center text-xs text-[var(--foreground-muted)]">
            {voiceHint}
          </p>
        )}
      </div>

      {/* 送る → AIが理解 → 仕事完了 */}
      <div className="mx-auto mt-8 flex max-w-2xl items-center justify-center gap-3 text-sm font-medium text-[var(--foreground-muted)]">
        <span className="text-foreground">{t.flowSend}</span>
        <span aria-hidden className="text-accent">
          →
        </span>
        <span className="text-foreground">{t.flowUnderstand}</span>
        <span aria-hidden className="text-accent">
          →
        </span>
        <span className="text-foreground">{t.flowDone}</span>
      </div>

      {/* 例 */}
      <section aria-labelledby="upload-examples-title" className="mx-auto mt-8 max-w-2xl">
        <h2
          id="upload-examples-title"
          className="text-center text-sm font-medium text-[var(--foreground-muted)]"
        >
          {t.examplesTitle}
        </h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {t.examples.map((example) => (
            <li
              key={example.label}
              className="flex items-center gap-3 rounded-[18px] border border-[var(--border-subtle)] bg-[var(--card)] px-4 py-3"
            >
              <span className="text-xl" aria-hidden>
                {example.emoji}
              </span>
              <span className="min-w-0 flex-1 text-sm text-foreground">
                <span className="font-medium">{example.label}</span>
                <span aria-hidden className="mx-1.5 text-[var(--foreground-muted)]">
                  →
                </span>
                <span className="text-[var(--foreground-muted)]">
                  {example.arrow}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
