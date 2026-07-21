// @ts-check
/**
 * Scripted E2E proof for the notification →「結果を見る」→ /results/<id> flow.
 *
 * Drives a real browser through the REAL components:
 *   NotificationList → href /results/<notificationId> → ResultsView →
 *   ProjectDetailView → DeliverableResultView (deliverable BODY visible).
 *
 * Also verifies: canonical href, navigation destination, deliverable body text,
 * a never-blank reason for a missing target, and a narrow (mobile) viewport.
 *
 * Usage:  node e2e/results-flow.mjs [baseUrl]
 * Default baseUrl: http://localhost:3005
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE = process.argv[2] || "http://localhost:3005";
const NOTIFICATION_ID = "ntf_devcontract";
const EXPECTED_HREF = `/results/${NOTIFICATION_ID}`;
const OUT_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "screenshots",
);
mkdirSync(OUT_DIR, { recursive: true });

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch();
try {
  // ---- 1. Desktop: full deliverable flow ---------------------------------
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/dev/results-flow-preview`, { waitUntil: "networkidle" });
  await page.waitForSelector("text=結果を見る", { timeout: 15000 });
  await page.screenshot({ path: path.join(OUT_DIR, "01-notification-list.png"), fullPage: true });

  const link = page.locator('a:has(button:has-text("結果を見る"))').first();
  const href = await link.getAttribute("href");
  check("canonical href is /results/<notificationId>", href === EXPECTED_HREF, `href=${href}`);

  await link.click();
  await page.waitForURL(`**${EXPECTED_HREF}`, { timeout: 15000 });
  check("navigates to the real /results/<id> route", page.url().includes(EXPECTED_HREF), page.url());

  // The deliverable BODY must be visible on the results page.
  await page.waitForSelector("text=契約書の要約", { timeout: 15000 });
  const bodyText = await page.locator("body").innerText();
  check("deliverable title visible", bodyText.includes("契約書の要約"));
  check("deliverable body visible (委託料)", bodyText.includes("委託料"));
  check("deliverable body visible (秘密保持)", bodyText.includes("秘密保持"));
  await page.screenshot({ path: path.join(OUT_DIR, "02-results-deliverable.png"), fullPage: true });

  // ---- 2. Missing target → never blank (visible reason) -------------------
  await page.goto(`${BASE}/results/ntf_missing_target_xyz`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const missingText = await page.locator("body").innerText();
  const hasReason =
    missingText.includes("ログイン") ||
    missingText.includes("見つかりません") ||
    missingText.includes("旧形式") ||
    missingText.includes("権限");
  check("missing target shows a visible reason (never blank)", hasReason);
  await page.screenshot({ path: path.join(OUT_DIR, "03-missing-target-reason.png"), fullPage: true });

  await ctx.close();

  // ---- 3. Mobile viewport: results page renders on narrow screen ----------
  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const mpage = await mctx.newPage();
  await mpage.goto(`${BASE}/dev/results-flow-preview`, { waitUntil: "networkidle" });
  await mpage.waitForSelector("text=結果を見る", { timeout: 15000 });
  await mpage.locator('a:has(button:has-text("結果を見る"))').first().click();
  await mpage.waitForURL(`**${EXPECTED_HREF}`, { timeout: 15000 });
  await mpage.waitForSelector("text=契約書の要約", { timeout: 15000 });
  const mBody = await mpage.locator("body").innerText();
  check("mobile: deliverable visible on 390px viewport", mBody.includes("契約書の要約") && mBody.includes("委託料"));
  // No horizontal overflow (content fits the viewport width).
  const scrollW = await mpage.evaluate(() => document.documentElement.scrollWidth);
  const clientW = await mpage.evaluate(() => document.documentElement.clientWidth);
  check("mobile: no horizontal overflow", scrollW <= clientW + 2, `scrollW=${scrollW} clientW=${clientW}`);
  await mpage.screenshot({ path: path.join(OUT_DIR, "04-results-mobile.png"), fullPage: true });
  await mctx.close();
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
process.exit(failed.length === 0 ? 0 : 1);
