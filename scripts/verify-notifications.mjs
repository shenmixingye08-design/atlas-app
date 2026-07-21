import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3005";
const NAV_TIMEOUT = 90000;
const OUT = path.resolve("verification-screenshots");
mkdirSync(OUT, { recursive: true });

const results = [];
function log(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}${detail ? ` :: ${detail}` : ""}`);
}

async function panelFits(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="notification-panel"]');
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const closeBtn = el.querySelector('button[aria-label="お知らせを閉じる"]');
    const cb = closeBtn ? closeBtn.getBoundingClientRect() : null;
    return {
      found: true,
      vw: window.innerWidth,
      vh: window.innerHeight,
      left: Math.round(r.left),
      right: Math.round(r.right),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      fitsX: r.left >= -1 && r.right <= window.innerWidth + 1,
      fitsTop: r.top >= -1,
      closeVisible:
        !!cb &&
        cb.left >= 0 &&
        cb.right <= window.innerWidth + 1 &&
        cb.top >= 0 &&
        cb.bottom <= window.innerHeight + 1,
    };
  });
}

async function runViewport(browser, { label, width, height, isMobile }) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: isMobile ? 3 : 1,
    isMobile,
    hasTouch: isMobile,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(NAV_TIMEOUT);
  await page.goto(`${BASE}/dev/notification-panel-preview`, {
    waitUntil: "domcontentloaded",
    timeout: NAV_TIMEOUT,
  });
  await page.waitForSelector('[data-testid="notification-panel"]', {
    timeout: NAV_TIMEOUT,
  });

  // Read derived titles.
  const titles = await page
    .locator('[data-testid="derived-title"]')
    .allInnerTexts();
  log(
    `${label}: derived titles present`,
    titles.length >= 5,
    titles.map((t) => t.replace(/^・/, "")).join(" | "),
  );

  const fit = await panelFits(page);
  log(
    `${label}: panel fits viewport (no L/R/top overflow)`,
    fit.found && fit.fitsX && fit.fitsTop,
    JSON.stringify(fit),
  );
  log(`${label}: close button reachable`, fit.closeVisible, "");

  await page.screenshot({
    path: path.join(OUT, `panel-${label}.png`),
    fullPage: false,
  });

  await context.close();
}

async function runDeepLink(browser) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(NAV_TIMEOUT);
  // Seeds the durable-shaped project into localStorage on mount.
  await page.goto(`${BASE}/dev/notification-panel-preview`, {
    waitUntil: "domcontentloaded",
    timeout: NAV_TIMEOUT,
  });
  await page.waitForSelector('[data-testid="notification-panel"]', {
    timeout: NAV_TIMEOUT,
  });

  // Find the 契約書 notification card inside the inline panel and click its
  // 「結果を見る」 button — the REAL NotificationList action link.
  const inlinePanel = page.locator('[data-testid="notification-panel"]').first();
  const contractCard = inlinePanel
    .locator("li")
    .filter({ hasText: "契約書" })
    .first();
  const seeResult = contractCard.getByRole("link", { name: "結果を見る" });
  await seeResult.waitFor({ state: "visible" });
  const href = await seeResult.getAttribute("href");
  log(
    "deep-link: 結果を見る targets THAT deliverable (not a list)",
    href === "/projects/commander-contract",
    `href=${href}`,
  );

  // Follow the real link target. `/projects/[id]` is Clerk-protected, so a
  // logged-out request is redirected to sign-in with the EXACT target
  // preserved (proving the button points at THAT deliverable, not a list).
  await page.goto(`${BASE}${href}`, {
    waitUntil: "domcontentloaded",
    timeout: NAV_TIMEOUT,
  });
  const afterClickUrl = page.url();
  const guardedToTarget =
    afterClickUrl.includes("/projects/commander-contract") ||
    afterClickUrl.includes("redirect_url=%2Fprojects%2Fcommander-contract");
  log(
    "deep-link: target route resolves to THAT deliverable (guard preserves target)",
    guardedToTarget,
    afterClickUrl,
  );
  await page.screenshot({
    path: path.join(OUT, "deeplink-click-target.png"),
    fullPage: false,
  });

  await context.close();
}

/**
 * Prove the REAL ProjectDetailView → DeliverableResultView renders THAT
 * deliverable's content (the same component tree `/projects/[id]` renders).
 */
async function runRealDetailRender(browser) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(NAV_TIMEOUT);
  await page.goto(`${BASE}/dev/project-detail-preview`, {
    waitUntil: "domcontentloaded",
    timeout: NAV_TIMEOUT,
  });
  await page.waitForSelector("text=契約書の要約", { timeout: NAV_TIMEOUT });
  const bodyText = await page.locator("body").innerText();
  const hasTitle = bodyText.includes("契約書の要約");
  const hasContent =
    bodyText.includes("委託料") || bodyText.includes("秘密保持");
  log(
    "result view: real ProjectDetailView shows THAT 成果物 content",
    hasTitle && hasContent,
    `title=${hasTitle} content=${hasContent}`,
  );
  await page.screenshot({
    path: path.join(OUT, "deeplink-deliverable.png"),
    fullPage: true,
  });
  await context.close();
}

/** Prove every non-ready state is explicit (never blank). */
async function runStateFallbacks(browser) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(NAV_TIMEOUT);
  const cases = [
    { state: "generating", text: "まだ生成中です" },
    { state: "failed", text: "生成に失敗しました" },
    { state: "not_found", text: "結果が見つかりませんでした" },
  ];
  for (const c of cases) {
    await page.goto(`${BASE}/dev/deliverable-preview?state=${c.state}`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    await page
      .waitForSelector(`text=${c.text}`, { timeout: NAV_TIMEOUT })
      .catch(() => {});
    const body = await page.locator("body").innerText();
    log(`state fallback: ${c.state} shows「${c.text}」`, body.includes(c.text), "");
    await page.screenshot({
      path: path.join(OUT, `state-${c.state}.png`),
      fullPage: false,
    });
  }
  await context.close();
}

const browser = await chromium.launch();
try {
  await runViewport(browser, { label: "pc", width: 1280, height: 800, isMobile: false });
  await runViewport(browser, { label: "iphone", width: 390, height: 844, isMobile: true });
  await runViewport(browser, { label: "android", width: 412, height: 915, isMobile: true });
  await runDeepLink(browser);
  await runRealDetailRender(browser);
  await runStateFallbacks(browser);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n==== SUMMARY: ${results.length - failed.length}/${results.length} passed ====`);
if (failed.length > 0) {
  console.log("FAILED:", failed.map((f) => f.name).join("; "));
  process.exit(1);
}
