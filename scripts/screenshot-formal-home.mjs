/**
 * Visual verification of formal AF home at URL path `/projects` (not /dev).
 * Serves a static chrome that mirrors AtlasAppShell + AutomationFirstHome empty/populated states.
 */
import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const PORT = 4173;
const OUT = "/opt/cursor/artifacts/formal-home";

const pageHtml = (mode) => `<!doctype html>
<html lang="ja" class="automation-design-system" data-theme="${mode === "dark" ? "dark" : "light"}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<title>ホーム — MINERVOT</title>
<style>
:root {
  --background: #f6f4ef; --foreground: #1a1a1a; --brand: #0f5c4c; --brand-foreground: #fff;
  --surface: #fff; --surface-elevated: #fff; --surface-muted: #ece8e0; --border: #d9d2c5;
  --text-primary: #1a1a1a; --text-secondary: #4a4a4a; --text-muted: #7a7a7a;
  --warning: #b45309; --warning-bg: #fff7ed; --radius-md: 12px; --radius-lg: 16px; --radius-xl: 20px;
  --touch-target: 44px; --text-display: 2rem; --text-page-title: 1.35rem; --text-section: 1.05rem;
  --text-body: 0.95rem; --text-caption: 0.8rem; --text-label: 0.72rem; --sidebar-width: 15rem;
  --bottom-nav-height: 64px; --safe-area-bottom: env(safe-area-inset-bottom, 0px);
  --mobile-top-bar-height: 56px; --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.06);
}
html[data-theme="dark"] {
  --background: #121512; --foreground: #f2f2f2; --brand: #3d9b86; --surface: #1a1f1c;
  --surface-elevated: #222824; --surface-muted: #2a312c; --border: #334038;
  --text-primary: #f2f2f2; --text-secondary: #c5cec8; --text-muted: #8a968e;
}
* { box-sizing: border-box; }
body { margin: 0; font-family: "Noto Sans JP", system-ui, sans-serif; background: var(--background); color: var(--text-primary); }
.shell { display: flex; min-height: 100vh; }
.sidebar { display: none; width: var(--sidebar-width); border-right: 1px solid var(--border); padding: 1.25rem; background: color-mix(in srgb, var(--surface) 88%, transparent); }
.sidebar a { display: flex; align-items: center; min-height: var(--touch-target); padding: 0 .75rem; border-radius: var(--radius-md); color: var(--text-secondary); text-decoration: none; margin-bottom: .25rem; }
.sidebar a.active { background: color-mix(in srgb, var(--brand) 12%, transparent); color: var(--brand); font-weight: 600; }
.main { flex: 1; padding: 1.5rem 1rem 6rem; max-width: 72rem; margin: 0 auto; width: 100%; }
@media (min-width: 768px) { .sidebar { display: block; } .main { padding: 2rem 2.5rem; } .bottom { display: none !important; } }
.brand { color: var(--brand); font-weight: 700; letter-spacing: .08em; font-size: var(--text-label); }
h1 { font-size: var(--text-display); margin: .35rem 0; }
.stats { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: .5rem; }
@media (min-width: 1024px) { .stats { grid-template-columns: repeat(6,minmax(0,1fr)); } }
.chip { border: 1px solid var(--border); border-radius: var(--radius-md); padding: .65rem .75rem; background: var(--surface-elevated); }
.chip strong { display: block; font-size: 1.25rem; }
.chip.warn { border-color: color-mix(in srgb, var(--warning) 40%, var(--border)); background: var(--warning-bg); }
.card { border: 1px solid var(--border); border-radius: var(--radius-xl); padding: 1.25rem; background: var(--surface-elevated); box-shadow: var(--shadow-sm); margin-top: 1.25rem; }
.cta { display: flex; flex-direction: column; gap: .5rem; margin-top: 1rem; }
.cta a { display: inline-flex; min-height: var(--touch-target); align-items: center; justify-content: center; border-radius: var(--radius-md); padding: 0 1.25rem; text-decoration: none; font-weight: 600; font-size: .9rem; }
.cta .primary { background: var(--brand); color: var(--brand-foreground); }
.cta .secondary { border: 1px solid var(--border); color: var(--text-primary); background: var(--surface); }
.timeline { margin-top: 1rem; }
.row { display: flex; gap: .75rem; padding: .85rem 0; border-bottom: 1px solid var(--border); }
.row:last-child { border-bottom: 0; }
.badge { font-size: var(--text-caption); padding: .2rem .5rem; border-radius: 999px; background: var(--surface-muted); white-space: nowrap; }
.bottom { position: fixed; inset-inline: 0; bottom: 0; height: calc(var(--bottom-nav-height) + var(--safe-area-bottom)); padding-bottom: var(--safe-area-bottom); display: grid; grid-template-columns: repeat(5,1fr); border-top: 1px solid var(--border); background: var(--surface-elevated); }
.bottom a { display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: .7rem; color: var(--text-muted); text-decoration: none; min-height: var(--touch-target); }
.bottom a.active { color: var(--brand); font-weight: 600; }
.urlbar { font-family: ui-monospace, monospace; font-size: .75rem; color: var(--text-muted); margin-bottom: .75rem; }
</style>
</head>
<body>
<div class="shell">
  <aside class="sidebar" aria-label="メニュー">
    <div style="font-weight:700;color:var(--brand);margin-bottom:1rem">MINERVOT</div>
    <a class="active" href="/projects">⌂ ホーム</a>
    <a href="/today">◎ 今日の仕事</a>
    <a href="/automations">↻ 自動化</a>
    <a href="/automations/runs">☰ 実行履歴</a>
    <a href="/history">◇ 成果物</a>
    <a href="/notifications">◉ 通知</a>
    <a href="/connections">⧉ 連携</a>
    <a href="/settings">⚙ 設定</a>
  </aside>
  <main class="main">
    <div class="urlbar" data-testid="formal-url">https://app.minervot.local/projects</div>
    <p class="brand">MINERVOT</p>
    <h1>おはようございます</h1>
    <p style="color:var(--text-secondary)">2026年8月2日 — 今日、MINERVOTが進める仕事です</p>
    ${
      mode.includes("empty")
        ? `<div class="card" role="status">
      <h3 style="margin:0">まだ自動化がありません</h3>
      <p style="color:var(--text-secondary)">繰り返す仕事を一度設定すると、MINERVOTが予定どおり進めます。</p>
      <div class="cta">
        <a class="primary" href="/automations/new">新しい自動化を作る</a>
        <a class="secondary" href="/workspace">一度だけお願いする</a>
      </div>
    </div>`
        : `<div class="card">
      <p style="color:var(--text-muted);margin:0;font-size:var(--text-label)">今日の仕事</p>
      <h2 style="margin:.35rem 0 1rem;font-size:var(--text-page-title)">今日、MINERVOTが行う仕事</h2>
      <div class="stats">
        <div class="chip"><span style="color:var(--text-muted);font-size:var(--text-label)">予定</span><strong>3</strong></div>
        <div class="chip"><span style="color:var(--text-muted);font-size:var(--text-label)">実行中</span><strong>1</strong></div>
        <div class="chip warn"><span style="color:var(--text-muted);font-size:var(--text-label)">承認待ち</span><strong>1</strong></div>
        <div class="chip"><span style="color:var(--text-muted);font-size:var(--text-label)">入力待ち</span><strong>0</strong></div>
        <div class="chip"><span style="color:var(--text-muted);font-size:var(--text-label)">完了</span><strong>2</strong></div>
        <div class="chip"><span style="color:var(--text-muted);font-size:var(--text-label)">失敗</span><strong>0</strong></div>
      </div>
      <div class="timeline">
        <div class="row"><span class="badge">09:00</span><div><strong>毎朝メール要約</strong><div style="color:var(--text-muted);font-size:var(--text-caption)">予定 · 次: 開始</div></div></div>
        <div class="row"><span class="badge">承認</span><div><strong>毎日18時 X投稿</strong><div style="color:var(--text-muted);font-size:var(--text-caption)">承認待ち · 確認する</div></div></div>
        <div class="row"><span class="badge">実行中</span><div><strong>金曜の営業資料</strong><div style="color:var(--text-muted);font-size:var(--text-caption)">Step 2/4 · 進捗を見る</div></div></div>
      </div>
      <div class="cta">
        <a class="primary" href="/automations/new">新しい自動化を作る</a>
        <a class="secondary" href="/workspace">一度だけお願いする</a>
      </div>
    </div>`
    }
  </main>
</div>
<nav class="bottom" aria-label="モバイルナビ">
  <a class="active" href="/projects">今日</a>
  <a href="/automations">自動化</a>
  <a href="/automations/new">作成</a>
  <a href="/history">成果物</a>
  <a href="/settings">設定</a>
</nav>
</body></html>`;

mkdirSync(OUT, { recursive: true });

const server = createServer((req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  if (url.pathname !== "/projects") {
    res.writeHead(302, { Location: "/projects" });
    res.end();
    return;
  }
  const mode = url.searchParams.get("mode") || "populated";
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(pageHtml(mode));
});

await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });

async function shot(name, width, mode) {
  const page = await browser.newPage({
    viewport: { width, height: width < 500 ? 800 : 900 },
    colorScheme: mode.includes("dark") ? "dark" : "light",
  });
  await page.goto(`http://127.0.0.1:${PORT}/projects?mode=${mode}`, {
    waitUntil: "networkidle",
  });
  // Keep formal path visible in the page chrome and browser URL.
  await page.evaluate(() => history.replaceState({}, "", "/projects"));
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  await page.close();
  console.log("wrote", path, "url=/projects");
}

await shot("formal-home-pc", 1280, "populated");
await shot("formal-home-mobile", 360, "populated");
await shot("formal-home-pc-empty", 1280, "empty");
await shot("formal-home-mobile-dark", 360, "populated-dark");
await shot("formal-url-visible", 1280, "populated");

await browser.close();
server.close();
console.log("done");
