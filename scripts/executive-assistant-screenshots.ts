/**
 * Generate static dashboard HTML + screenshots for AI Executive Assistant.
 * Run: npx tsx scripts/executive-assistant-screenshots.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { buildExecutiveDashboard } from "../lib/executive-assistant/dashboard";
import { SECRETARY_MODE_LABELS } from "../lib/executive-assistant/settings";

const outDir = "/opt/cursor/artifacts/ai-executive-assistant";
mkdirSync(outDir, { recursive: true });

const now = new Date("2026-08-07T10:00:00.000Z");

const dash = buildExecutiveDashboard({
  now,
  secretaryMode: "suggest_only",
  maxProposals: 6,
  automations: [
    {
      id: "auto-sales",
      name: "営業資料作成",
      enabled: true,
      schedule: {
        kind: "schedule",
        label: "毎週金曜 18:00",
        preset: { type: "weekly", dayOfWeek: 5, hour: 18, minute: 0 },
      },
      lastRun: "2026-07-31T09:00:00.000Z",
      nextRun: "2026-08-14T09:00:00.000Z",
      workflow: {
        assignment: "営業資料をPowerPointで作りPDF化しDropboxへ保存しSlack共有",
      },
    },
  ],
  projects: [
    {
      id: "proj-1",
      title: "来週の営業会議資料",
      workRequest: "営業資料を作成\n【期限】2026-08-08",
      status: "pending",
    },
  ],
  jobUsage: [
    {
      jobCategory: "sales_material",
      label: "営業資料",
      count: 8,
      lastUsedAt: "2026-08-01T09:00:00.000Z",
      frequency: "weekly",
      preferredFormat: "pptx",
      preferredHour: 18,
    },
  ],
  workMemories: [
    {
      id: "mem-3",
      type: "workflow",
      title: "営業フロー",
      summary: "営業 資料 PDF Dropbox Slack",
      tags: ["営業", "営業資料", "PDF", "Dropbox", "Slack"],
      usageCount: 5,
      lastUsedAt: "2026-08-01T09:00:00.000Z",
      structuredData: {
        steps: ["営業", "営業資料", "PDF", "Dropbox", "Slack共有"],
      },
      isUserConfirmed: true,
    },
    {
      id: "mem-1",
      type: "correction",
      title: "箇条書きに統一",
      summary: "営業資料は毎回箇条書き",
      tags: ["correction", "営業"],
      usageCount: 4,
      lastUsedAt: "2026-08-01T09:00:00.000Z",
      isUserConfirmed: true,
    },
    {
      id: "mem-2",
      type: "correction",
      title: "箇条書きに統一",
      summary: "再度修正",
      tags: ["correction"],
      usageCount: 2,
      lastUsedAt: "2026-08-02T09:00:00.000Z",
    },
  ],
  replyMissSignals: [
    { id: "mail-1", subject: "見積りの件", ageHours: 36 },
  ],
  notifications: [
    {
      id: "n1",
      type: "awaiting_review",
      title: "承認待ちの自動化",
      message: "確認してください",
      createdAt: "2026-08-06T10:00:00.000Z",
      readAt: null,
    },
  ],
});

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const cards = dash.proposals
  .map(
    (p) => `
  <article class="card">
    <div class="row">
      <h3>${esc(p.title)}</h3>
      <span class="score">${p.automationScore}%</span>
    </div>
    <p class="msg">${esc(p.message)}</p>
    <p class="reason">${esc(p.reason)}</p>
    ${
      p.memoryChain?.length
        ? `<p class="chain">${esc(p.memoryChain.join(" → "))}</p>`
        : ""
    }
    <div class="actions">
      <span class="cta">${esc(p.actionLabel)}</span>
      <span class="stars">${"★".repeat(p.stars)}${"☆".repeat(5 - p.stars)}</span>
    </div>
  </article>`,
  )
  .join("\n");

const memory = dash.recentMemory
  .map(
    (m) =>
      `<li><strong>${esc(m.jobLabel)}</strong><br/>${esc(m.steps.join(" → "))}</li>`,
  )
  .join("");

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8"/>
<title>AI Executive Assistant — Dashboard</title>
<style>
  :root {
    --bg: #0f1419;
    --surface: #1a222c;
    --border: #2a3544;
    --text: #e8eef5;
    --muted: #8b9aab;
    --brand: #3d8bfd;
    --accent: #5b9dff;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif;
    background: radial-gradient(1200px 600px at 10% -10%, #1b2a40, var(--bg));
    color: var(--text);
    padding: 32px;
  }
  .wrap { max-width: 720px; margin: 0 auto; }
  .eyebrow { color: var(--accent); font-size: 12px; letter-spacing: 0.08em; font-weight: 600; }
  h1 { margin: 4px 0 8px; font-size: 22px; }
  .meta { color: var(--muted); font-size: 12px; margin-bottom: 24px; }
  h2 { font-size: 14px; margin: 28px 0 12px; }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 14px 16px;
    margin-bottom: 12px;
  }
  .row { display: flex; justify-content: space-between; gap: 12px; }
  h3 { margin: 0; font-size: 14px; }
  .score { font-size: 12px; color: var(--muted); }
  .msg { margin: 8px 0 4px; font-size: 13px; color: #c5d0dc; }
  .reason, .chain { margin: 0; font-size: 11px; color: var(--muted); }
  .actions { display: flex; justify-content: space-between; margin-top: 10px; align-items: center; }
  .cta {
    display: inline-block;
    background: var(--brand);
    color: white;
    font-size: 12px;
    font-weight: 600;
    padding: 6px 12px;
    border-radius: 8px;
  }
  .stars { font-size: 12px; color: #f0c14b; }
  ul { padding-left: 18px; color: #c5d0dc; font-size: 13px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } body { padding: 16px; } }
</style>
</head>
<body>
  <div class="wrap">
    <p class="eyebrow">AI Executive Assistant</p>
    <h1>AI秘書からの提案</h1>
    <p class="meta">モード: ${esc(SECRETARY_MODE_LABELS[dash.secretaryMode])}
      · 表示 ${dash.shownCount}件
      ${dash.suppressedCount ? `· 抑制 ${dash.suppressedCount}件` : ""}
    </p>

    <h2>今日の提案</h2>
    ${cards}

    <div class="grid">
      <div>
        <h2>仕事予測</h2>
        <ul>${dash.predictions.map((p) => `<li>${esc(p.title)}</li>`).join("") || "<li>なし</li>"}</ul>
      </div>
      <div>
        <h2>自動化候補</h2>
        <ul>${dash.automationCandidates.map((p) => `<li>${"★".repeat(p.stars)} ${esc(p.title)} (${p.automationScore}%)</li>`).join("") || "<li>なし</li>"}</ul>
      </div>
    </div>

    <h2>最近覚えたこと（仕事単位）</h2>
    <ul>${memory || "<li>なし</li>"}</ul>

    <h2>今週見つけた改善</h2>
    <ul>${dash.improvements.map((p) => `<li>${esc(p.title)}</li>`).join("") || "<li>なし</li>"}</ul>
  </div>
</body>
</html>`;

const htmlPath = join(outDir, "executive-dashboard.html");
writeFileSync(htmlPath, html, "utf8");
writeFileSync(
  join(outDir, "dashboard-snapshot.json"),
  JSON.stringify(
    {
      shownCount: dash.shownCount,
      suppressedCount: dash.suppressedCount,
      proposalKinds: dash.proposals.map((p) => p.kind),
      scores: dash.proposals.map((p) => p.automationScore),
      memoryChains: dash.recentMemory.map((m) => m.steps),
    },
    null,
    2,
  ),
  "utf8",
);

console.log("Wrote", htmlPath);
console.log("Proposals:", dash.proposals.length, "Memory:", dash.recentMemory.length);
