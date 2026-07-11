"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/design-system/cn";

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

function getSpeechRecognitionCtor():
  | (new () => SpeechRecognitionLike)
  | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function SecretaryChatComposer() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const dragDepthRef = useRef(0);

  useEffect(() => {
    setVoiceSupported(Boolean(getSpeechRecognitionCtor()));
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const addFiles = useCallback((list: FileList | File[]) => {
    const next = Array.from(list).map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
      file,
    }));
    setFiles((prev) => [...prev, ...next].slice(0, 12));
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const submit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed && files.length === 0) return;

    const fileNote =
      files.length > 0
        ? `\n\n（添付予定: ${files.map((item) => item.file.name).join("、")}）`
        : "";
    const assignment = `${trimmed || "添付資料の整理をお願いします。"}${fileNote}`;
    router.push(`/commander?assignment=${encodeURIComponent(assignment)}`);
  }, [files, router, text]);

  const toggleVoice = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setVoiceHint("このブラウザでは音声入力に対応していません。");
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
      setVoiceHint("音声を取得できませんでした。もう一度お試しください。");
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    setVoiceHint(null);
    setListening(true);
    recognition.start();
  }, [listening]);

  return (
    <section
      aria-labelledby="secretary-chat-heading"
      className="relative"
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
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepthRef.current = 0;
        setDragging(false);
        if (event.dataTransfer.files?.length) {
          addFiles(event.dataTransfer.files);
        }
      }}
    >
      <div
        className={cn(
          "rounded-[28px] border bg-[var(--card)] p-5 shadow-[var(--shadow-md)] transition-all duration-300 sm:p-7",
          dragging
            ? "border-accent bg-accent/[0.04] ring-2 ring-accent/20"
            : "border-[var(--border-subtle)]",
        )}
      >
        <div className="flex items-start gap-3 sm:gap-4">
          <div
            className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--background-subtle)] text-accent sm:h-12 sm:w-12"
            aria-hidden
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M8 13.5c1.2 1.6 2.8 2.4 4 2.4s2.8-.8 4-2.4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <circle cx="9" cy="10" r="1" fill="currentColor" />
              <circle cx="15" cy="10" r="1" fill="currentColor" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="secretary-chat-heading"
              className="text-lg font-semibold tracking-tight text-foreground sm:text-xl"
            >
              今日は何をお手伝いしますか？
            </h2>
            <p className="mt-1 text-sm text-[var(--foreground-muted)]">
              文章・資料・写真を送るだけで、AI秘書が仕事を進めます。
            </p>
          </div>
        </div>

        <label className="sr-only" htmlFor="secretary-chat-input">
          AI秘書への依頼
        </label>
        <textarea
          id="secretary-chat-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={4}
          placeholder="例：このPDFを要約して / 今日のSNS投稿を作成して"
          className="mt-5 w-full resize-none rounded-[20px] border border-[var(--border-subtle)] bg-[var(--background-subtle)]/60 px-4 py-4 text-base leading-relaxed text-foreground outline-none transition-colors placeholder:text-[var(--foreground-muted)] focus:border-accent/40 focus:bg-[var(--card)] focus:ring-2 focus:ring-accent/15 sm:min-h-[140px] sm:px-5 sm:text-[17px]"
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              submit();
            }
          }}
        />

        {files.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {files.map((item) => (
              <li
                key={item.id}
                className="inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--background-subtle)] px-3 py-1.5 text-xs text-foreground"
              >
                <span className="truncate">{item.file.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(item.id)}
                  className="text-[var(--foreground-muted)] hover:text-foreground"
                  aria-label={`${item.file.name}を削除`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files?.length) addFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-full"
            >
              資料を追加
            </Button>
            <Button
              variant={listening ? "primary" : "secondary"}
              size="sm"
              onClick={toggleVoice}
              disabled={!voiceSupported && !listening}
              className="rounded-full"
              aria-pressed={listening}
            >
              {listening ? "聞き取り中…" : "音声入力"}
            </Button>
            <p className="hidden text-xs text-[var(--foreground-muted)] sm:block">
              ここにドラッグ＆ドロップもできます
            </p>
          </div>
          <Button
            variant="primary"
            size="lg"
            onClick={submit}
            disabled={!text.trim() && files.length === 0}
            className="w-full sm:w-auto"
          >
            AI秘書へ依頼する
          </Button>
        </div>

        {(dragging || voiceHint) && (
          <p
            className={cn(
              "mt-4 text-center text-sm",
              dragging ? "font-medium text-accent" : "text-[var(--foreground-muted)]",
            )}
          >
            {dragging ? "ここにドロップして資料を追加" : voiceHint}
          </p>
        )}
      </div>
    </section>
  );
}
