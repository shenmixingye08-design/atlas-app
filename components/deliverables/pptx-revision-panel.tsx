"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { triggerBlobDownload } from "@/lib/browser/trigger-blob-download";
import type { PresentationModel, ThemeId } from "@/lib/pptx-secretary/types";

type Props = {
  deliverableId: string;
  initialTitle?: string;
};

const THEMES: ThemeId[] = [
  "business",
  "sales",
  "corporate",
  "modern",
  "simple",
  "startup",
  "education",
  "training",
  "report",
  "proposal",
];

export function PptxRevisionPanel({ deliverableId, initialTitle }: Props) {
  const [assignment, setAssignment] = useState(
    initialTitle ? `${initialTitle}を営業向けに短く再構成` : "5枚に短くして",
  );
  const [theme, setTheme] = useState<ThemeId>("sales");
  const [minutes, setMinutes] = useState(5);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function regenerate() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const created = await fetch("/api/pptx/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignment: `${assignment}（${minutes}分・テーマ${theme}）`,
          brand: { companyName: "MINERVOT" },
        }),
      });
      const body = (await created.json()) as {
        ok?: boolean;
        error?: string;
        presentation?: PresentationModel;
        base64?: string;
        fileName?: string;
        warnings?: string[];
      };
      if (!created.ok || !body.presentation || !body.base64) {
        throw new Error(body.error || "再生成に失敗しました");
      }

      const edited = await fetch("/api/pptx/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presentation: body.presentation,
          operations: [
            { op: "change_theme", theme },
            { op: "set_duration", minutes },
            { op: "shorten_text" },
            { op: "regenerate_notes" },
          ],
          revisionNote: `revision from ${deliverableId}`,
        }),
      });
      const editedBody = (await edited.json()) as {
        ok?: boolean;
        error?: string;
        base64?: string;
        fileName?: string;
      };
      if (!edited.ok || !editedBody.base64) {
        throw new Error(editedBody.error || "revisionの作成に失敗しました");
      }

      const bytes = Uint8Array.from(atob(editedBody.base64), (c) =>
        c.charCodeAt(0),
      );
      triggerBlobDownload(
        new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        }),
        editedBody.fileName || "revision.pptx",
      );
      setMessage(
        `新しいrevisionを作成しました（元成果物 ${deliverableId} は上書きしていません）`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "再編集に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function exportPdf() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/pptx/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignment: assignment || initialTitle || "プレゼン資料",
          format: "pdf",
        }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        error?: string;
        base64?: string;
        fileName?: string;
      };
      if (!response.ok || !body.base64) {
        throw new Error(body.error || "PDF変換に失敗しました");
      }
      const bytes = Uint8Array.from(atob(body.base64), (c) => c.charCodeAt(0));
      triggerBlobDownload(
        new Blob([bytes], { type: "application/pdf" }),
        body.fileName || "presentation.pdf",
      );
      setMessage("PDFを作成しました（元pptxは保持）");
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF変換に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        元のPowerPointは上書きせず、新しいrevisionとして出力します。
      </p>
      <label className="block space-y-1">
        <span className="font-medium">再編集の指示</span>
        <textarea
          className="min-h-20 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2"
          value={assignment}
          onChange={(event) => setAssignment(event.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <label className="space-y-1">
          <span className="font-medium">テーマ</span>
          <select
            className="block min-h-10 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-2"
            value={theme}
            onChange={(event) => setTheme(event.target.value as ThemeId)}
          >
            {THEMES.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="font-medium">発表時間</span>
          <select
            className="block min-h-10 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-2"
            value={minutes}
            onChange={(event) => setMinutes(Number(event.target.value))}
          >
            {[3, 5, 10, 15, 30, 60].map((m) => (
              <option key={m} value={m}>
                {m}分
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void regenerate()} disabled={busy}>
          {busy ? "処理中…" : "revisionを作成"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void exportPdf()}
          disabled={busy}
        >
          PDF化
        </Button>
      </div>
      {message ? <p className="text-foreground">{message}</p> : null}
      {error ? <p className="text-destructive">{error}</p> : null}
    </div>
  );
}
