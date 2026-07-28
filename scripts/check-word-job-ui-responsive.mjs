/**
 * Responsive smoke check for Word post-submit status panel (static harness).
 * Mirrors production copy + tap-target rules used by WordJobStatusPanel.
 *
 * Usage: node scripts/check-word-job-ui-responsive.mjs
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const outDir = "/opt/cursor/artifacts/word-mobile-ux";
const htmlPath = path.resolve("scripts/word-job-ui-responsive-static.html");
const widths = [
  { width: 360, label: "360" },
  { width: 390, label: "390" },
  { width: 412, label: "412" },
  { width: 768, label: "768" },
  { width: 1280, label: "desktop" },
];
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
    for (const { width, label } of widths) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });

      for (const phase of phases) {
        await page.evaluate((p) => window.renderPhase(p), phase);
        await page.waitForTimeout(80);
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
            };
          });
          const overflowX =
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth + 1;
          return { title, buttons, overflowX };
        });

        const file = path.join(outDir, `${label}-${phase}.png`);
        await page.screenshot({ path: file, fullPage: true });

        const minTap = metrics.buttons.every((b) => b.height >= 48);
        const ok = !metrics.overflowX && minTap && Boolean(metrics.title);
        results.push({
          width,
          label,
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

  const summary = {
    total: results.length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
  await writeFile(
    path.join(outDir, "summary.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
