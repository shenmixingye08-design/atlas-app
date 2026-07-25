/**
 * Local visual verification for 業務プロフィール entry (no Clerk required).
 * Starts next dev if needed, screenshots /dev/business-profile-preview,
 * and probes the Vercel Preview URL reachability (SSO vs public).
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const PREVIEW =
  "https://atlas-git-cur-6c055e-httpsgithubcomshenmixingye08-designatlas-a.vercel.app";
const ARTIFACT_DIR = "/opt/cursor/artifacts/business-profile-preview";
mkdirSync(ARTIFACT_DIR, { recursive: true });

async function waitForLocal(url, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status > 0) return true;
    } catch {
      // retry
    }
    await sleep(1000);
  }
  return false;
}

async function probePreview() {
  const paths = ["/settings", "/settings/business-profile"];
  const results = [];
  for (const path of paths) {
    const res = await fetch(`${PREVIEW}${path}`, { redirect: "manual" });
    const location = res.headers.get("location") ?? "";
    results.push({
      path,
      status: res.status,
      location,
      ssoBlocked:
        location.includes("vercel.com/sso-api") ||
        location.includes("vercel.com/login"),
      clerkRedirect: location.includes("/sign-in"),
    });
  }
  writeFileSync(
    `${ARTIFACT_DIR}/preview-probe.json`,
    JSON.stringify({ preview: PREVIEW, results, at: new Date().toISOString() }, null, 2),
  );
  return results;
}

async function main() {
  const previewResults = await probePreview();
  console.log("Preview probe:", JSON.stringify(previewResults, null, 2));

  const localBase = "http://127.0.0.1:3010";
  let child = null;
  const ready = await waitForLocal(`${localBase}/dev/business-profile-preview`, 2);
  if (!ready) {
    child = spawn(
      "npx",
      ["next", "dev", "--port", "3010", "--hostname", "127.0.0.1"],
      {
        cwd: process.cwd(),
        stdio: "inherit",
        env: {
          ...process.env,
          NODE_ENV: "development",
          NEXT_TELEMETRY_DISABLED: "1",
          // Minimal placeholders so Clerk middleware can boot in dev
          // /dev routes are excluded from Clerk middleware; keys are unused there.
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
            process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "",
          CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY || "",
        },
      },
    );
    const ok = await waitForLocal(`${localBase}/dev/business-profile-preview`, 90);
    if (!ok) {
      child?.kill("SIGTERM");
      throw new Error("Local next dev did not become ready");
    }
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await page.goto(`${localBase}/dev/business-profile-preview`, {
    waitUntil: "networkidle",
    timeout: 120000,
  });
  await page.getByRole("heading", { name: "業務プロフィール" }).first().waitFor();
  await page.screenshot({
    path: `${ARTIFACT_DIR}/mobile-settings-entry.png`,
    fullPage: true,
  });

  // Desktop
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({
    path: `${ARTIFACT_DIR}/desktop-settings-entry.png`,
    fullPage: true,
  });

  // Preview SSO page screenshot (what phones currently see without Vercel login)
  try {
    await page.goto(`${PREVIEW}/settings`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.screenshot({
      path: `${ARTIFACT_DIR}/preview-settings-current.png`,
      fullPage: true,
    });
  } catch (error) {
    writeFileSync(
      `${ARTIFACT_DIR}/preview-settings-error.txt`,
      String(error),
    );
  }

  await browser.close();
  child?.kill("SIGTERM");
  console.log(`Artifacts written to ${ARTIFACT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
