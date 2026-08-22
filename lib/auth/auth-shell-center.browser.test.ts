import { readFileSync } from "node:fs";
import { join } from "node:path";

import { chromium, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const VIEWPORTS = [375, 390, 430, 768, 1024, 1440] as const;
const CSS = readFileSync(
  join(process.cwd(), "components/auth/auth-shell.css"),
  "utf8",
);

/**
 * Replica of the Production Clerk DOM measured on atlasapp.jp
 * (SignIn / SignUp share this tree). Default Clerk cardBox width is 25rem
 * with a painted shadow — the combination that looked right-shifted inside
 * the padded decorative frame after PR #321.
 */
function fixtureHtml(theme: "light" | "dark"): string {
  const pageBg = theme === "dark" ? "#0f1218" : "#fffdfb";
  const frameBg = theme === "dark" ? "#171a21" : "#ffffff";
  return `<!doctype html>
<html data-theme="${theme}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; background: ${pageBg}; }
      .auth-card-frame {
        background: ${frameBg};
        border: 1px solid rgba(40, 26, 30, 0.08);
        border-radius: 24px;
        padding: 16px;
      }
      @media (min-width: 640px) {
        .auth-shell-column { padding: 32px 32px; }
        .auth-card-frame { padding: 24px; }
      }
      .auth-shell-column { padding: 24px 16px; }
      /* Clerk defaults observed on production before our overrides */
      .cl-rootBox { display: block; width: 25rem; min-width: 25rem; }
      .cl-cardBox {
        display: flex;
        flex-direction: column;
        position: relative;
        width: 25rem;
        min-width: 25rem;
        overflow: hidden;
        box-shadow:
          rgba(0, 0, 0, 0.08) 0px 5px 15px 0px,
          rgba(0, 0, 0, 0.2) 0px 15px 35px -5px,
          rgba(117, 104, 107, 0.07) 0px 0px 0px 1px;
      }
      .cl-card {
        width: 25rem;
        min-width: 25rem;
        padding: 32px 40px;
        margin-top: -1px;
        background: ${frameBg};
        border-radius: 16px;
      }
      .cl-socialButtonsBlockButton,
      .cl-formFieldInput,
      .cl-formButtonPrimary {
        display: block;
        width: 100%;
        padding: 12px;
      }
      ${CSS}
    </style>
  </head>
  <body>
    <div class="auth-shell-column">
      <div class="auth-card-frame">
        <div class="cl-rootBox cl-signIn-root">
          <div class="cl-cardBox cl-signIn-start">
            <div class="cl-card cl-signIn-start">
              <div class="cl-header"><h1>MINERVOTにログイン</h1></div>
              <div class="cl-main">
                <div class="cl-socialButtons">
                  <button class="cl-socialButtonsBlockButton">Googleでログイン</button>
                </div>
                <form class="cl-form">
                  <input class="cl-formFieldInput" />
                  <button class="cl-formButtonPrimary">続ける</button>
                </form>
              </div>
            </div>
            <div class="cl-footer">Secured by clerk</div>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

type NamedRect = {
  left: number;
  width: number;
  right: number;
  centerX: number;
};

function measureScript() {
  const sels = [
    ".auth-shell-column",
    ".auth-card-frame",
    ".cl-rootBox",
    ".cl-cardBox",
    ".cl-card",
  ] as const;
  const named: Record<string, NamedRect | null> = {};
  for (const sel of sels) {
    const el = document.querySelector(sel);
    if (!el) {
      named[sel] = null;
      continue;
    }
    const r = el.getBoundingClientRect();
    named[sel] = {
      left: r.left,
      width: r.width,
      right: r.right,
      centerX: r.left + r.width / 2,
    };
  }
  const frame = named[".auth-card-frame"];
  const card = named[".cl-cardBox"] ?? named[".cl-card"];
  return {
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    named,
    frameCenter: frame?.centerX ?? null,
    cardCenter: card?.centerX ?? null,
    diff:
      frame && card ? card.centerX - frame.centerX : Number.POSITIVE_INFINITY,
    leftGap: frame && card ? card.left - frame.left : Number.POSITIVE_INFINITY,
    rightGap:
      frame && card ? frame.right - card.right : Number.POSITIVE_INFINITY,
  };
}

describe("AuthShell live bounding-box centering", () => {
  let browser: Browser | undefined;

  beforeAll(async () => {
    const args = ["--no-sandbox", "--disable-dev-shm-usage"];
    try {
      browser = await chromium.launch({
        channel: "chrome",
        args,
        timeout: 8_000,
      });
    } catch {
      try {
        browser = await chromium.launch({ args, timeout: 20_000 });
      } catch {
        // Quality Gate does not install Playwright browsers.
        browser = undefined;
      }
    }
  }, 45_000);

  afterAll(async () => {
    await browser?.close();
  }, 15_000);

  for (const theme of ["light", "dark"] as const) {
    it(`centers Clerk in the frame for ${theme} at required viewports`, async ({
      skip,
    }) => {
      if (!browser) {
        skip();
        return;
      }
      const page = await browser.newPage();
      await page.setContent(fixtureHtml(theme), { waitUntil: "load" });

      for (const width of VIEWPORTS) {
        await page.setViewportSize({
          width,
          height: width >= 768 ? 900 : 844,
        });
        const row = await page.evaluate(measureScript);

        expect(row.named[".auth-shell-column"], `${width}`).toBeTruthy();
        expect(row.named[".auth-card-frame"], `${width}`).toBeTruthy();
        expect(row.named[".cl-rootBox"], `${width}`).toBeTruthy();
        expect(row.named[".cl-cardBox"], `${width}`).toBeTruthy();
        expect(row.named[".cl-card"], `${width}`).toBeTruthy();
        expect(Math.abs(row.diff), `${width} center`).toBeLessThanOrEqual(1);
        expect(
          Math.abs(row.leftGap - row.rightGap),
          `${width} gutters`,
        ).toBeLessThanOrEqual(1);
        expect(row.scrollWidth, `${width} scroll`).toBeLessThanOrEqual(
          width + 1,
        );
      }

      await page.close();
    }, 30_000);
  }
});
