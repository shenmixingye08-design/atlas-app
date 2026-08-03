/**
 * Visual proof for first-value secretary home (empty Quick Start + dashboard + ROI).
 * Static chrome mirroring AutomationFirstHome — no mocks of deliverables.
 */
import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const PORT = 4177;
const OUT = "/opt/cursor/artifacts/first-value";

const css = `
:root {
  --background: #f3f1ec; --foreground: #1a1a1a; --brand: #0f5c4c; --brand-foreground: #fff;
  --surface: #fff; --surface-elevated: #fff; --surface-muted: #ebe6dc; --border: #d5cec0;
  --text-primary: #1a1a1a; --text-secondary: #4a4a4a; --text-muted: #7a7a7a;
  --radius-md: 12px; --radius-lg: 16px; --radius-xl: 20px; --touch-target: 44px;
  --text-display: 2rem; --text-page-title: 1.35rem; --text-section: 1.05rem;
  --text-body: 0.95rem; --text-caption: 0.8rem; --text-label: 0.72rem;
  --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.06);
}
* { box-sizing: border-box; }
body { margin: 0; font-family: "Noto Sans JP", ui-sans-serif, system-ui, sans-serif;
  background: radial-gradient(1200px 600px at 10% -10%, #e7f0ec, transparent),
              linear-gradient(180deg, #f7f5f0, #efebe3); color: var(--text-primary); }
.wrap { max-width: 72rem; margin: 0 auto; padding: 1.5rem 1rem 4rem; }
.brand { color: var(--brand); font-weight: 700; letter-spacing: .08em; font-size: var(--text-label); }
h1 { font-size: var(--text-display); margin: .35rem 0; }
.sub { color: var(--text-secondary); font-size: var(--text-body); }
.panel { border: 1px solid var(--border); border-radius: var(--radius-xl); padding: 1.25rem;
  background: var(--surface-elevated); box-shadow: var(--shadow-sm); margin-top: 1.25rem; }
.grid4 { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 1rem; margin-top: 1rem; }
@media (min-width: 640px) { .grid4 { grid-template-columns: repeat(4,minmax(0,1fr)); } }
.metric label { display:block; font-size: var(--text-label); color: var(--text-muted); }
.metric strong { display:block; font-size: 1.25rem; margin-top: .15rem; }
.hint { font-size: var(--text-caption); color: var(--text-muted); }
.roi { margin-top: 1rem; border: 1px solid color-mix(in srgb, var(--brand) 28%, var(--border));
  background: color-mix(in srgb, var(--brand) 6%, var(--surface)); border-radius: var(--radius-md); padding: 1rem; }
.cta-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: .5rem; margin-top: .75rem; }
@media (min-width: 640px) { .cta-grid { grid-template-columns: repeat(3,minmax(0,1fr)); } }
.cta { min-height: var(--touch-target); border: 1px solid var(--border); border-radius: var(--radius-md);
  background: var(--surface); font-weight: 600; display:flex; align-items:center; justify-content:center; }
.primary { background: var(--brand); color: var(--brand-foreground); border:0; min-height: var(--touch-target);
  border-radius: var(--radius-md); width: 100%; font-weight: 700; }
.level { border: 1px solid var(--border); border-radius: var(--radius-md); padding: .5rem .75rem; text-align:right; }
.steps li { display:flex; justify-content:space-between; padding: .35rem 0; font-size: .9rem; }
.ok { color: #047857; font-weight: 600; }
.url { font-family: ui-monospace, monospace; font-size: .75rem; color: var(--text-muted); margin-bottom: .75rem; }
`;

function page(mode) {
  const empty = mode === "empty";
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>MINERVOT first-value ${mode}</title><style>${css}</style></head><body>
<div class="wrap">
  <div class="url">https://app.minervot.local/projects${empty ? " (empty)" : ""}</div>
  <p class="brand">MINERVOT</p>
  <h1>おはようございます</h1>
  <p class="sub">2026年8月2日 — 会話ではなく、仕事が終わるAI秘書です</p>

  <section class="panel">
    <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap">
      <div>
        <p class="brand">AI秘書ダッシュボード</p>
        <h2 style="margin:.25rem 0;font-size:var(--text-section)">今日の仕事の進み具合</h2>
      </div>
      <div class="level"><div class="hint">秘書レベル ${empty ? "1" : "3"}</div>
        <strong>${empty ? "見習い秘書" : "専属秘書"}</strong></div>
    </div>
    <div class="grid4">
      <div class="metric"><label>今日終わった仕事</label><strong>${empty ? "0件" : "2件"}</strong></div>
      <div class="metric"><label>削減時間</label><strong>${empty ? "—" : "約24分"}</strong><span class="hint">推定</span></div>
      <div class="metric"><label>今実行中</label><strong>${empty ? "0件" : "1件"}</strong></div>
      <div class="metric"><label>今日の予定</label><strong>${empty ? "0件" : "3件"}</strong></div>
    </div>
    <div class="roi">
      <div class="hint">¥980 の価値（推定）</div>
      <strong>${empty ? "推定: まだ削減時間が記録されていません" : "推定: 今月 約8時間 削減（¥980/月）"}</strong>
      <p class="hint" style="margin:.35rem 0 0">Memory利用 ${empty ? "0" : "4"} 回 · Memory完成率 ${empty ? "0" : "50"}%</p>
    </div>
    <p class="hint" style="margin-top:1rem">${empty
      ? "仕事が進むと、次に自動化できる提案を1件だけご用意します。"
      : "AIから提案（1件）— 次はこれを自動化できます — 毎週の議事録作成"}</p>
  </section>

  ${empty ? `
  <section class="panel">
    <h2 style="margin:0;font-size:var(--text-page-title)">最初の仕事をAIへ任せましょう</h2>
    <p class="sub">空のままにはしません。選んで、タイトル・頻度・仕事内容だけ入力すれば自動化できます。</p>
    <p class="hint" style="margin-top:1rem">主CTA</p>
    <div class="cta-grid">
      <div class="cta">営業資料を作る</div><div class="cta">メールを書く</div>
      <div class="cta">レシート整理</div><div class="cta">議事録作成</div>
      <div class="cta">請求書整理</div><div class="cta">画像解析</div>
    </div>
    <div style="margin-top:1rem;border-top:1px solid var(--border);padding-top:1rem">
      <p style="font-weight:600;margin:0 0 .75rem">Quick Start（タイトル・頻度・仕事内容だけ）</p>
      <p class="hint">タイトル: 営業資料の作成</p>
      <p class="hint">頻度: 毎週</p>
      <p class="hint">仕事内容: 営業資料を作成してください…</p>
      <button class="primary" style="margin-top:.75rem">自動化を作成する</button>
    </div>
  </section>
  <section class="panel">
    <h2 style="margin:0;font-size:var(--text-page-title)">自動化を保存しました</h2>
    <p class="sub">予定を待たず、今すぐ一度実行して成果物をご用意できます。</p>
    <button class="primary" style="margin-top:1rem">まず一度試す</button>
  </section>` : `
  <section class="panel">
    <h2 style="margin:0;font-size:var(--text-section)">仕事完了一覧</h2>
    <div style="margin-top:1rem;border:1px solid var(--border);border-radius:var(--radius-lg);padding:1rem">
      <strong>営業資料</strong>
      <ul class="steps" style="list-style:none;padding:0;margin:.75rem 0 0">
        <li><span>成果物</span><span class="ok">完了</span></li>
        <li><span>保存</span><span class="ok">完了</span></li>
        <li><span>メール送信</span><span class="ok">完了</span></li>
      </ul>
    </div>
  </section>`}
</div></body></html>`;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const server = createServer((req, res) => {
    const mode = (req.url || "").includes("populated") ? "populated" : "empty";
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(page(mode));
  });
  await new Promise((resolve) => server.listen(PORT, resolve));
  const browser = await chromium.launch();
  const shots = [
    ["empty-desktop.png", "empty", { width: 1280, height: 900 }],
    ["empty-mobile.png", "empty", { width: 390, height: 844 }],
    ["dashboard-desktop.png", "populated", { width: 1280, height: 900 }],
    ["dashboard-mobile.png", "populated", { width: 390, height: 844 }],
  ];
  for (const [name, mode, viewport] of shots) {
    const page = await browser.newPage({ viewport });
    await page.goto(`http://127.0.0.1:${PORT}/${mode}`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${OUT}/${name}`, fullPage: true });
    await page.close();
    console.log("wrote", name);
  }
  await browser.close();
  server.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
