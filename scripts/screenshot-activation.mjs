import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";
const OUT = path.join(process.cwd(), "verification-screenshots", "activation");

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

  // PC — choose / configure / receive
  {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/dev/activation-preview`, {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(500);
    await shot(page, "activation-choose-pc.png");

    await page.getByRole("button", { name: "2 設定" }).click();
    await page.waitForTimeout(300);
    await shot(page, "activation-configure-pc.png");

    await page.getByRole("button", { name: "4 完成" }).click();
    await page.waitForTimeout(300);
    await shot(page, "activation-receive-pc.png");
    await ctx.close();
  }

  // Mobile 360
  {
    const ctx = await browser.newContext({
      viewport: { width: 360, height: 740 },
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/dev/activation-preview`, {
      waitUntil: "networkidle",
    });
    await page.getByRole("button", { name: "PC" }).click(); // toggle to 360
    await page.waitForTimeout(300);
    await shot(page, "activation-choose-mobile-360.png");

    await page.getByRole("button", { name: "2 設定" }).click();
    await page.waitForTimeout(300);
    await shot(page, "activation-configure-mobile-360.png");

    await page.getByRole("button", { name: "4 完成" }).click();
    await page.waitForTimeout(300);
    await shot(page, "activation-receive-mobile-360.png");
    await ctx.close();
  }

  // Empty home path may redirect to sign-in — still capture landing CTA if possible
  {
    const ctx = await browser.newContext({
      ...devices["iPhone 13"],
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/projects?activation=1`, {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(1500);
    await shot(page, "activation-projects-entry-mobile.png");
    await ctx.close();
  }

  await browser.close();
  console.log("done", OUT);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
