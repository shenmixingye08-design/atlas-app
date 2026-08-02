import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";
const OUT = path.join(
  process.env.ARTIFACTS_DIR ?? "/opt/cursor/artifacts",
  "screenshots",
  "retention",
);

async function shot(page, name) {
  await page.screenshot({
    path: path.join(OUT, name),
    fullPage: true,
  });
  console.log("saved", name);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/dev/retention-preview`, {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(600);
    await shot(page, "retention-wizard-pc.png");

    await page.getByRole("button", { name: "2 Home" }).click();
    await page.waitForTimeout(400);
    await shot(page, "retention-home-pc.png");

    await page.getByRole("button", { name: "3 Survey" }).click();
    await page.waitForTimeout(400);
    await shot(page, "retention-survey-pc.png");

    await page.getByRole("button", { name: "4 7日プラン" }).click();
    await page.waitForTimeout(400);
    await shot(page, "retention-dayplan-pc.png");
    await ctx.close();
  }

  {
    const ctx = await browser.newContext({
      viewport: { width: 360, height: 740 },
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/dev/retention-preview`, {
      waitUntil: "networkidle",
    });
    await page.getByRole("button", { name: "PC" }).click();
    await page.waitForTimeout(300);
    await shot(page, "retention-wizard-mobile.png");

    await page.getByRole("button", { name: "2 Home" }).click();
    await page.waitForTimeout(300);
    await shot(page, "retention-home-mobile.png");
    await ctx.close();
  }

  await browser.close();
  console.log("done", OUT);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
