import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";
const OUT = path.join(
  process.env.ARTIFACTS_DIR ?? "/opt/cursor/artifacts",
  "screenshots",
  "production",
);

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name), fullPage: true });
  console.log("saved", name);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/dev/production-preview`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await shot(page, "production-ops-pc.png");
    await ctx.close();
  }

  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/dev/production-preview`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await shot(page, "production-ops-mobile.png");
    await ctx.close();
  }

  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/api/health/production`, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    await shot(page, "production-health-json.png");
    await ctx.close();
  }

  await browser.close();
  console.log("done", OUT);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
