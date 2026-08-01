import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

export async function captureOpsScreenshots(input: {
  outDir: string;
  panels: Array<{ label: string; title: string; rows: Array<[string, string]> }>;
}): Promise<Array<{ label: string; path: string | null; note: string }>> {
  const shotDir = join(input.outDir, "screenshots");
  mkdirSync(shotDir, { recursive: true });
  const results: Array<{ label: string; path: string | null; note: string }> =
    [];

  const htmlFor = (title: string, rows: Array<[string, string]>) => {
    const body = rows
      .map(
        ([k, v]) =>
          `<tr><th>${esc(k)}</th><td><code>${esc(v)}</code></td></tr>`
      )
      .join("");
    return `<!doctype html><html lang="ja"><meta charset="utf-8"/><title>${esc(
      title
    )}</title>
    <style>
      body{margin:0;padding:32px;font-family:"Noto Sans JP",sans-serif;background:linear-gradient(150deg,#102a43,#243b53);color:#f0f4f8}
      .card{max-width:900px;padding:28px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14)}
      h1{margin:0 0 12px;font-size:26px}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th{width:220px;text-align:left;padding:8px;opacity:.75}
      td{padding:8px;word-break:break-all}
      code{font-family:ui-monospace,monospace;font-size:12px}
    </style>
    <div class="card"><h1>${esc(title)}</h1><table>${body}</table>
    <p style="opacity:.7;margin-top:16px;font-size:12px">MINERVOT Ops Durability Phase3 — secrets masked</p></div>`;
  };

  let playwright: typeof import("playwright") | null = null;
  try {
    playwright = await import("playwright");
  } catch {
    for (const p of input.panels) {
      const htmlPath = join(shotDir, `${p.label}.html`);
      writeFileSync(htmlPath, htmlFor(p.title, p.rows), "utf8");
      results.push({ label: p.label, path: htmlPath, note: "html only" });
    }
    writeFileSync(join(shotDir, "index.json"), JSON.stringify(results, null, 2));
    return results;
  }

  let browser: import("playwright").Browser | null = null;
  try {
    browser = await playwright.chromium.launch({ headless: true });
  } catch (error) {
    for (const p of input.panels) {
      const htmlPath = join(shotDir, `${p.label}.html`);
      writeFileSync(htmlPath, htmlFor(p.title, p.rows), "utf8");
      results.push({
        label: p.label,
        path: htmlPath,
        note: error instanceof Error ? error.message : String(error),
      });
    }
    writeFileSync(join(shotDir, "index.json"), JSON.stringify(results, null, 2));
    return results;
  }

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    for (const p of input.panels) {
      const html = htmlFor(p.title, p.rows);
      writeFileSync(join(shotDir, `${p.label}.html`), html, "utf8");
      try {
        await page.setContent(html, { waitUntil: "load" });
        const png = join(shotDir, `${p.label}.png`);
        await page.screenshot({ path: png, fullPage: true });
        results.push({ label: p.label, path: png, note: "ok" });
      } catch (error) {
        results.push({
          label: p.label,
          path: join(shotDir, `${p.label}.html`),
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

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
