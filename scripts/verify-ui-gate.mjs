import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3005";
const OUT = path.join(process.cwd(), "tmp", "ui-verify");

async function setLightWarm(page) {
  await page.addInitScript(() => {
    localStorage.setItem("atlas-theme", "light-warm");
    document.documentElement.dataset.theme = "light-warm";
    document.documentElement.style.colorScheme = "light";
  });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  // Desktop sign-in
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await setLightWarm(page);
    await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    const body = await page.textContent("body");
    const hasAtlas = /Sign in to ATLAS|Welcome back|Don't have an account/i.test(body ?? "");
    const hasMinervot = /MINERVOTにログイン|MINERVOT/.test(body ?? "");
    await page.screenshot({ path: path.join(OUT, "clerk-sign-in-desktop-light-warm.png"), fullPage: true });
    console.log(`sign-in desktop: ATLAS=${hasAtlas} MINERVOT=${hasMinervot}`);
    await ctx.close();
  }

  // Mobile sign-in
  {
    const ctx = await browser.newContext({ ...devices["iPhone 13"] });
    const page = await ctx.newPage();
    await setLightWarm(page);
    await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, "clerk-sign-in-mobile-light-warm.png"), fullPage: true });
    await ctx.close();
  }

  // History filters (may redirect if auth required)
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await setLightWarm(page);
    await page.goto(`${BASE}/history`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT, "history-desktop-light-warm.png"), fullPage: true });
    console.log(`history url: ${page.url()}`);
    await ctx.close();
  }

  // Notification panel preview (dev)
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await setLightWarm(page);
    await page.goto(`${BASE}/dev/notification-panel-preview`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, "notification-panel-desktop-light-warm.png"), fullPage: true });
    await ctx.close();
  }

  {
    const ctx = await browser.newContext({ ...devices["iPhone 13"] });
    const page = await ctx.newPage();
    await setLightWarm(page);
    await page.goto(`${BASE}/dev/notification-panel-preview`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, "notification-panel-mobile-light-warm.png"), fullPage: true });
    await ctx.close();
  }

  // History filters preview (dev)
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await setLightWarm(page);
    await page.goto(`${BASE}/dev/history-filters-preview`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, "history-filters-desktop-light-warm.png"), fullPage: true });
    await ctx.close();
  }

  {
    const ctx = await browser.newContext({ ...devices["iPhone 13"] });
    const page = await ctx.newPage();
    await setLightWarm(page);
    await page.goto(`${BASE}/dev/history-filters-preview`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, "history-filters-mobile-light-warm.png"), fullPage: true });
    await ctx.close();
  }

  // Home shell top actions (dev)
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await setLightWarm(page);
    await page.goto(`${BASE}/dev/home-preview`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, "home-top-actions-desktop-light-warm.png"), fullPage: true });
    await ctx.close();
  }

  {
    const ctx = await browser.newContext({ ...devices["iPhone 13"] });
    const page = await ctx.newPage();
    await setLightWarm(page);
    await page.goto(`${BASE}/dev/home-preview`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, "home-top-actions-mobile-light-warm.png"), fullPage: true });
    await ctx.close();
  }

  await browser.close();
  console.log(`Screenshots saved to ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
