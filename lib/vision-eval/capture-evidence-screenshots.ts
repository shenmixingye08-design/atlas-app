import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

/**
 * Capture production evidence screenshots via Playwright when available.
 * Masks nothing sensitive in health JSON (no secrets expected).
 * Returns paths; never invents success screenshots.
 */
export async function captureVisionEvidenceScreenshots(input: {
  outDir: string;
  productionBaseUrl: string;
  labels: string[];
}): Promise<Array<{ label: string; path: string | null; note: string }>> {
  const shotDir = join(input.outDir, "screenshots");
  mkdirSync(shotDir, { recursive: true });
  const results: Array<{ label: string; path: string | null; note: string }> = [];

  let playwright: typeof import("playwright") | null = null;
  try {
    playwright = await import("playwright");
  } catch {
    for (const label of input.labels) {
      results.push({
        label,
        path: null,
        note: "playwright unavailable",
      });
    }
    writeFileSync(
      join(shotDir, "README.md"),
      "Playwright not available — screenshots not captured.\n",
      "utf8"
    );
    return results;
  }

  let browser: import("playwright").Browser | null = null;
  try {
    browser = await playwright.chromium.launch({ headless: true });
  } catch (error) {
    const note = error instanceof Error ? error.message : String(error);
    for (const label of input.labels) {
      results.push({ label, path: null, note });
    }
    writeFileSync(
      join(shotDir, "README.md"),
      `Playwright browser launch failed:\n${note}\nRun: npx playwright install chromium\n`,
      "utf8"
    );
    writeFileSync(join(shotDir, "index.json"), JSON.stringify(results, null, 2), "utf8");
    return results;
  }

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    for (const label of input.labels) {
      try {
        if (label === "production_vision_health") {
          await page.goto(
            `${input.productionBaseUrl.replace(/\/$/, "")}/api/health/vision?force=1`,
            { waitUntil: "networkidle", timeout: 60_000 }
          );
        } else {
          // Placeholder page documenting required UI screenshot (Clerk login needed)
          await page.setContent(`<!doctype html><html><body style="font-family:sans-serif;padding:40px;background:#f7f4ef">
            <h1>MINERVOT Vision Evidence</h1>
            <p>Label: ${label}</p>
            <p>Authenticated UI screenshot requires Clerk test user — not available in this agent env.</p>
            <p>base: ${input.productionBaseUrl}</p>
            <p><strong>Not counted as production Vision UI evidence.</strong></p>
          </body></html>`);
        }
        const path = join(shotDir, `${label}.png`);
        await page.screenshot({ path, fullPage: true });
        results.push({
          label,
          path,
          note:
            label === "production_vision_health"
              ? "production health JSON (live OpenAI)"
              : "placeholder — needs Clerk session for real UI",
        });
      } catch (error) {
        results.push({
          label,
          path: null,
          note: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } finally {
    await browser.close();
  }

  writeFileSync(join(shotDir, "index.json"), JSON.stringify(results, null, 2), "utf8");
  return results;
}
