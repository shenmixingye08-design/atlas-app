import { mkdirSync } from "node:fs";
import { chromium, devices } from "playwright";

const BASE =
  process.env.AF_PREVIEW_URL ??
  "http://127.0.0.1:3000/dev/automation-first-preview";
const OUT = process.env.AF_SHOT_DIR ?? "/opt/cursor/artifacts/af-ui-polish";

mkdirSync(OUT, { recursive: true });

const EMPTY_OPS = {
  counts: {
    activeAutomations: 0,
    pausedAutomations: 0,
    running: 0,
    awaitingApproval: 0,
    needsInput: 0,
    failedToday: 0,
  },
  attention: [],
  todayWork: [],
  recentArtifacts: [],
  nextRun: null,
};

async function shot(page, name) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log("wrote", name);
}

async function stubApis(page) {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("operations") || url.includes("summary")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(EMPTY_OPS),
      });
      return;
    }
    if (url.includes("/runs") || url.includes("automation")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }
    if (url.includes("feature-flags")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          automation_first_home_enabled: true,
          automation_design_system_enabled: true,
          automation_first_navigation_enabled: true,
          automation_v2_enabled: true,
          automation_operations_enabled: true,
          automation_dashboard_v2_enabled: true,
        }),
      });
      return;
    }
    await route.continue();
  });
}

async function prepare(page, { empty = false, dark = false } = {}) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "ホーム（自動化あり）" })
    .waitFor({ state: "visible", timeout: 20000 });

  const target = empty ? "ホーム（0件）" : "ホーム（自動化あり）";
  await page.getByRole("button", { name: target }).click();
  await page.waitForTimeout(800);

  const themeBtn = page.getByRole("button", { name: /テーマ:/ });
  const label = (await themeBtn.textContent()) ?? "";
  const isDark = label.includes("dark");
  if (dark && !isDark) await themeBtn.click();
  if (!dark && isDark) await themeBtn.click();
  await page.waitForTimeout(400);

  if (empty) {
    await page.getByText("まだ自動化はありません").first().waitFor({
      timeout: 15000,
    });
  } else {
    await page.waitForSelector(".automation-first-home", { timeout: 15000 });
  }
}

async function main() {
  const browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROME ?? "/usr/local/bin/google-chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
  });
  const dpage = await desktop.newPage();
  await stubApis(dpage);
  await prepare(dpage, { empty: false, dark: false });
  await shot(dpage, "pc-light-home");
  await prepare(dpage, { empty: true, dark: false });
  await shot(dpage, "pc-light-empty");
  await prepare(dpage, { empty: false, dark: true });
  await shot(dpage, "pc-dark-home");
  await prepare(dpage, { empty: true, dark: true });
  await shot(dpage, "pc-dark-empty");
  await desktop.close();

  const mobile = await browser.newContext({ ...devices["iPhone 14"] });
  const mpage = await mobile.newPage();
  await stubApis(mpage);
  await prepare(mpage, { empty: false, dark: false });
  await shot(mpage, "mobile-light-home");
  await prepare(mpage, { empty: true, dark: false });
  await shot(mpage, "mobile-light-empty");
  await prepare(mpage, { empty: false, dark: true });
  await shot(mpage, "mobile-dark-home");
  await browser.close();
  console.log("done", OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
