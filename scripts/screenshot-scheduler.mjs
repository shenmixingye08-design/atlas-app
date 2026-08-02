import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";
const OUT = path.join(
  process.cwd(),
  "verification-screenshots",
  "scheduler-reliability",
);

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/dev/scheduler-preview`, {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(OUT, "scheduler-dashboard-pc.png"),
      fullPage: true,
    });
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({
      viewport: { width: 360, height: 740 },
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/dev/scheduler-preview`, {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(OUT, "scheduler-mobile-360.png"),
      fullPage: true,
    });
    await ctx.close();
  }
  await browser.close();
  console.log("done", OUT);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
