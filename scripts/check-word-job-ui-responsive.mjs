/**
 * Responsive smoke check for Word post-submit status panel.
 * Usage: node scripts/check-word-job-ui-responsive.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.argv[2] || "http://127.0.0.1:3000";
const outDir = "/opt/cursor/artifacts/word-mobile-ux";
const widths = [360, 390, 412, 768, 1280];
const phases = [
  "accepted",
  "processing",
  "completed",
  "failed",
  "timed_out",
  "network_error",
];

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const results = [];

  try {
    for (const width of widths) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`${baseUrl}/dev/word-job-status-preview`, {
        waitUntil: "networkidle",
        timeout: 60_000,
      });

      for (const phase of phases) {
        await page.click(`[data-phase="${phase}"]`);
        await page.waitForTimeout(150);
        const panel = page.locator('[data-testid="word-job-status-panel"]');
        await panel.waitFor({ state: "visible" });

        const metrics = await panel.evaluate((root) => {
          const title = root.querySelector("h2")?.textContent?.trim() ?? "";
          const buttons = [...root.querySelectorAll("button")].map((btn) => {
            const rect = btn.getBoundingClientRect();
            return {
              label: btn.textContent?.trim() ?? "",
              height: Math.round(rect.height),
              width: Math.round(rect.width),
              disabled: btn.disabled,
            };
          });
          const overflowX =
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth + 1;
          return { title, buttons, overflowX };
        });

        const file = path.join(outDir, `${width}-${phase}.png`);
        await page.screenshot({ path: file, fullPage: true });

        const minTap = metrics.buttons.every((b) => b.height >= 44);
        const ok = !metrics.overflowX && minTap && Boolean(metrics.title);
        results.push({
          width,
          phase,
          title: metrics.title,
          buttons: metrics.buttons,
          overflowX: metrics.overflowX,
          minTapOk: minTap,
          ok,
          screenshot: file,
        });
      }
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(JSON.stringify({ total: results.length, failed: failed.length, results }, null, 2));
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
