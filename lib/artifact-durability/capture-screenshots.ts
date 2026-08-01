import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

import type { ArtifactCaseResult, ConversionCaseResult } from "@/lib/artifact-durability/types";

/**
 * Evidence screenshots for Phase 2.
 * Uses Playwright when available. Does NOT invent production UI success —
 * pages show measured case results (request_id, hashes, stage flags).
 */
export async function captureArtifactDurabilityScreenshots(input: {
  outDir: string;
  results: ArtifactCaseResult[];
  conversions: ConversionCaseResult[];
  productionBaseUrl: string;
}): Promise<Array<{ label: string; path: string | null; note: string }>> {
  const shotDir = join(input.outDir, "screenshots");
  mkdirSync(shotDir, { recursive: true });
  const results: Array<{ label: string; path: string | null; note: string }> =
    [];

  const pick = (format: string) =>
    input.results.find((r) => r.format === format && r.okFinal) ??
    input.results.find((r) => r.format === format);

  const pickRev = (format: string) =>
    input.results.find(
      (r) => r.format === format && r.revisionAttempted && r.okRevision
    ) ??
    input.results.find((r) => r.format === format && r.revisionAttempted);

  const pickConv = (pair: string) =>
    input.conversions.find(
      (c) => `${c.sourceFormat}->${c.targetFormat}` === pair && c.ok
    ) ??
    input.conversions.find(
      (c) => `${c.sourceFormat}->${c.targetFormat}` === pair
    );

  const panels: Array<{ label: string; html: string; note: string }> = [];

  for (const format of ["docx", "xlsx", "pdf", "pptx"] as const) {
    const r = pick(format);
    panels.push({
      label: `${format}_generate_preview_dl`,
      note: r
        ? `local case ${r.caseId} final=${r.okFinal}`
        : "no case",
      html: evidenceHtml({
        title: `${format.toUpperCase()} 生成・プレビュー・DL`,
        subtitle: "Phase2 実測エビデンス（ローカル耐久）",
        rows: r
          ? [
              ["caseId", r.caseId],
              ["request_id", r.requestId],
              ["artifactId", r.artifactId ?? "null"],
              ["okGenerate", String(r.okGenerate)],
              ["okStructure", String(r.okStructure)],
              ["okStorage", String(r.okStorage)],
              ["okPreview", String(r.okPreview)],
              ["okDownload", String(r.okDownload)],
              ["okFinal", String(r.okFinal)],
              ["fileSize", String(r.fileSize)],
              ["sha256", r.sha256 ?? "null"],
              ["totalMs", String(r.totalMs)],
            ]
          : [["status", "missing"]],
      }),
    });

    const rev = pickRev(format);
    panels.push({
      label: `${format}_revision`,
      note: rev
        ? `revision attempted=${rev.revisionAttempted} ok=${rev.okRevision}`
        : "no revision case",
      html: evidenceHtml({
        title: `${format.toUpperCase()} 再編集 / revision`,
        subtitle: "元成果物非上書き・revision確認",
        rows: rev
          ? [
              ["caseId", rev.caseId],
              ["request_id", rev.requestId],
              ["artifactId", rev.artifactId ?? "null"],
              ["okRevision", String(rev.okRevision)],
              ["failedStage", rev.failedStage ?? "—"],
              ["log_tail", rev.log.slice(-3).join(" | ")],
            ]
          : [["status", "missing"]],
      }),
    });
  }

  for (const pair of ["docx->pdf", "xlsx->pdf", "pptx->pdf"] as const) {
    const c = pickConv(pair);
    panels.push({
      label: `convert_${pair.replace("->", "_to_")}`,
      note: c ? `${c.caseId} ok=${c.ok}` : "missing",
      html: evidenceHtml({
        title: `変換 ${pair}`,
        subtitle: "source非上書き・派生成果物",
        rows: c
          ? [
              ["caseId", c.caseId],
              ["request_id", c.requestId],
              ["sourceArtifactId", c.sourceArtifactId ?? "null"],
              ["targetArtifactId", c.targetArtifactId ?? "null"],
              ["rootArtifactId", c.rootArtifactId ?? "null"],
              ["overwrittenSource", String(c.overwrittenSource)],
              ["ok", String(c.ok)],
              ["zeroByte", String(c.zeroByte)],
            ]
          : [["status", "missing"]],
      }),
    });
  }

  panels.push({
    label: "revision_history",
    note: "aggregate revision sample",
    html: evidenceHtml({
      title: "revision 履歴サンプル",
      subtitle: "各形式の再編集試行ログ",
      rows: (["docx", "xlsx", "pdf", "pptx"] as const).flatMap((f) => {
        const rev = pickRev(f);
        return [
          [`${f}.caseId`, rev?.caseId ?? "—"],
          [`${f}.okRevision`, String(rev?.okRevision ?? false)],
          [`${f}.request_id`, rev?.requestId ?? "—"],
        ];
      }),
    }),
  });

  panels.push({
    label: "production_blocked",
    note: "production UI requires Clerk — not claimed as pass",
    html: evidenceHtml({
      title: "本番 UI スクリーンショット未取得",
      subtitle: input.productionBaseUrl,
      rows: [
        [
          "reason",
          "Clerk / PRODUCTION_E2E_BASE_URL / CRON_SECRET 不足のため認証付き成果物UIは未撮影",
        ],
        ["counted_as_pass", "NO"],
      ],
    }),
  });

  let playwright: typeof import("playwright") | null = null;
  try {
    playwright = await import("playwright");
  } catch {
    writeFileSync(
      join(shotDir, "README.md"),
      "Playwright unavailable — HTML evidence written without PNG.\n",
      "utf8"
    );
    for (const p of panels) {
      const htmlPath = join(shotDir, `${p.label}.html`);
      writeFileSync(htmlPath, p.html, "utf8");
      results.push({ label: p.label, path: htmlPath, note: p.note + " (html only)" });
    }
    writeFileSync(join(shotDir, "index.json"), JSON.stringify(results, null, 2));
    return results;
  }

  let browser: import("playwright").Browser | null = null;
  try {
    browser = await playwright.chromium.launch({ headless: true });
  } catch (error) {
    const note = error instanceof Error ? error.message : String(error);
    for (const p of panels) {
      const htmlPath = join(shotDir, `${p.label}.html`);
      writeFileSync(htmlPath, p.html, "utf8");
      results.push({
        label: p.label,
        path: htmlPath,
        note: `${p.note}; chromium launch failed: ${note}`,
      });
    }
    writeFileSync(join(shotDir, "index.json"), JSON.stringify(results, null, 2));
    return results;
  }

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    for (const p of panels) {
      const htmlPath = join(shotDir, `${p.label}.html`);
      writeFileSync(htmlPath, p.html, "utf8");
      try {
        await page.setContent(p.html, { waitUntil: "load" });
        const pngPath = join(shotDir, `${p.label}.png`);
        await page.screenshot({ path: pngPath, fullPage: true });
        results.push({ label: p.label, path: pngPath, note: p.note });
      } catch (error) {
        results.push({
          label: p.label,
          path: existsSync(htmlPath) ? htmlPath : null,
          note: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } finally {
    await browser.close();
  }

  writeFileSync(join(shotDir, "index.json"), JSON.stringify(results, null, 2));
  return results;
}

function evidenceHtml(input: {
  title: string;
  subtitle: string;
  rows: Array<[string, string]>;
}): string {
  const rows = input.rows
    .map(
      ([k, v]) =>
        `<tr><th>${escapeHtml(k)}</th><td><code>${escapeHtml(v)}</code></td></tr>`
    )
    .join("");
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"/><title>${escapeHtml(
    input.title
  )}</title>
  <style>
    body{font-family:"Noto Sans JP",system-ui,sans-serif;margin:0;padding:32px;background:linear-gradient(160deg,#1a2332,#2c3e50);color:#f5f7fa}
    .card{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);padding:28px;max-width:920px}
    h1{font-size:28px;margin:0 0 8px;letter-spacing:.02em}
    .sub{opacity:.8;margin-bottom:20px}
    table{width:100%;border-collapse:collapse;font-size:14px}
    th{text-align:left;width:220px;padding:8px 10px;opacity:.75;font-weight:600}
    td{padding:8px 10px;word-break:break-all}
    code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
    .badge{display:inline-block;margin-top:16px;padding:6px 10px;border:1px solid rgba(255,255,255,.25);font-size:12px}
  </style></head><body>
  <div class="card">
    <h1>${escapeHtml(input.title)}</h1>
    <p class="sub">${escapeHtml(input.subtitle)}</p>
    <table>${rows}</table>
    <div class="badge">MINERVOT Artifact Durability Phase 2 — evidence (PII masked / synth only)</div>
  </div></body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
