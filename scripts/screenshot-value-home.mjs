import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";
const OUT = path.join(
  process.env.ARTIFACTS_DIR ?? "/opt/cursor/artifacts",
  "screenshots",
  "value-home",
);

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name), fullPage: true });
  console.log("saved", name);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/dev/value-preview`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    // Dismiss first-use pitch if present
    const cta = page.getByRole("button", { name: "成果を見る" });
    if (await cta.count()) {
      await cta.click({ force: true });
      await page.waitForTimeout(300);
    }
    await shot(page, "value-home-pc.png");
    await ctx.close();
  }

  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/dev/value-preview`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    const cta = page.getByRole("button", { name: "成果を見る" });
    if (await cta.count()) {
      await cta.click({ force: true });
      await page.waitForTimeout(300);
    }
    await shot(page, "value-home-mobile.png");
    await ctx.close();
  }

  await browser.close();
  console.log("done", OUT);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
