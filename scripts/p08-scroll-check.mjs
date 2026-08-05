/**
 * P08: measure horizontal overflow for landing-like pricing card at mobile widths.
 * Serves an inline fixture that mirrors the fixed Tailwind classes.
 */
import { createServer } from "node:http";
import { writeFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";

const HTML = `<!DOCTYPE html>
<html lang="ja"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-[#FFFDFB] text-[#281A1E]">
<div id="root" class="min-h-screen overflow-x-clip">
  <section class="relative isolate overflow-hidden px-4 pb-20 pt-14">
    <div class="mx-auto max-w-[1240px]">
      <ul class="mt-12 grid gap-5 overflow-x-clip md:grid-cols-2 xl:grid-cols-4">
        <li class="relative flex h-full flex-col overflow-hidden rounded-[24px] border border-[#74172A]/10 bg-white p-6">Plan A</li>
        <li class="relative flex h-full flex-col overflow-hidden rounded-[24px] border-2 border-[#B58B4F] bg-[#FFFDFB] p-6 md:scale-[1.03]">
          <div aria-hidden="true" class="pointer-events-none absolute right-[-40px] top-[-50px] h-40 w-40 rounded-full bg-[#D5AD70]/20 blur-3xl"></div>
          Popular Standard — MINERVOT has prepared today's work for you with full Japanese copy.
        </li>
        <li class="relative flex h-full flex-col overflow-hidden rounded-[24px] border border-[#74172A]/10 bg-white p-6">Plan C</li>
        <li class="relative flex h-full flex-col overflow-hidden rounded-[24px] border border-[#74172A]/10 bg-white p-6">Plan D</li>
      </ul>
    </div>
  </section>
</div>
</body></html>`;

const WIDTHS = [320, 360, 390, 430];
const OUT = "/opt/cursor/artifacts/p08-blocker-fixes/scroll";

async function main() {
  mkdirSync(OUT, { recursive: true });
  const server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(HTML);
  });
  await new Promise((r) => server.listen(8765, "127.0.0.1", r));

  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto("http://127.0.0.1:8765/", { waitUntil: "networkidle" });
    const metrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const body = document.body;
      return {
        clientWidth: doc.clientWidth,
        scrollWidth: Math.max(doc.scrollWidth, body.scrollWidth),
        rootScrollWidth: document.getElementById("root")?.scrollWidth ?? null,
      };
    });
    const overflow = metrics.scrollWidth - metrics.clientWidth;
    const shot = `${OUT}/${width}px.png`;
    await page.screenshot({ path: shot, fullPage: true });
    results.push({
      width,
      ...metrics,
      overflowPx: overflow,
      pass: overflow <= 0,
      screenshot: shot,
    });
    await page.close();
  }
  await browser.close();
  server.close();
  writeFileSync(`${OUT}/report.json`, JSON.stringify({ results }, null, 2));
  console.log(JSON.stringify({ results }, null, 2));
  if (results.some((r) => !r.pass)) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
