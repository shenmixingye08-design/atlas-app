import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const VIEWPORTS = [375, 390, 430, 768, 1024, 1440] as const;
const COLUMN_MAX_WIDTH = 448; // Tailwind max-w-md / 28rem
const CLERK_DEFAULT_CARD_BOX = 400;

type AuthShellLayout = {
  viewport: number;
  columnWidth: number;
  columnCenter: number;
  frameWidth: number;
  frameCenter: number;
  clerkWidth: number;
  clerkCenter: number;
  leftGutter: number;
  rightGutter: number;
  overflowX: boolean;
};

function pagePaddingX(viewport: number): number {
  return viewport >= 640 ? 32 : 16;
}

function framePaddingX(viewport: number): number {
  return viewport >= 640 ? 24 : 16;
}

function measureAuthShellLayout(
  viewport: number,
  options: { clerkCardBoxWidth: number; constrainToFrame: boolean },
): AuthShellLayout {
  const columnWidth = Math.min(viewport, COLUMN_MAX_WIDTH);
  const columnLeft = (viewport - columnWidth) / 2;
  const inset = pagePaddingX(viewport);
  const frameWidth = columnWidth - inset * 2;
  const frameLeft = columnLeft + inset;
  const inner = framePaddingX(viewport);
  const innerWidth = frameWidth - inner * 2;
  const clerkWidth = options.constrainToFrame
    ? innerWidth
    : options.clerkCardBoxWidth;
  const clerkLeft = frameLeft + inner;
  const frameRight = frameLeft + frameWidth;
  const clerkRight = clerkLeft + clerkWidth;

  return {
    viewport,
    columnWidth,
    columnCenter: columnLeft + columnWidth / 2,
    frameWidth,
    frameCenter: frameLeft + frameWidth / 2,
    clerkWidth,
    clerkCenter: clerkLeft + clerkWidth / 2,
    leftGutter: frameLeft,
    rightGutter: viewport - frameRight,
    overflowX:
      clerkLeft < 0 ||
      clerkRight > viewport ||
      frameLeft < 0 ||
      frameRight > viewport ||
      clerkWidth > innerWidth,
  };
}

describe("AuthShell Clerk card centering", () => {
  it("keeps the decorative frame and Clerk children in one centered column", () => {
    const shell = readWorkspaceFile("components/auth/auth-shell.tsx");
    expect(shell).toContain('import "./auth-shell.css"');
    expect(shell).toContain("auth-shell-column");
    expect(shell).toContain("auth-card-frame");
    expect(shell).toContain("{children}");
    expect(shell.indexOf("{children}")).toBeGreaterThan(
      shell.indexOf("auth-card-frame"),
    );
    expect(shell).not.toMatch(/translateX|translate\(/);
    expect(shell).not.toMatch(/left-\[|right-\[|ml-\[|mr-\[/);
  });

  it("pins Clerk boxes to the frame without changing global appearance", () => {
    const css = readWorkspaceFile("components/auth/auth-shell.css");
    expect(css).toContain(".auth-shell-column");
    expect(css).toContain(".auth-card-frame .cl-rootBox");
    expect(css).toContain(".auth-card-frame .cl-cardBox");
    expect(css).toContain(".auth-card-frame .cl-card");
    expect(css).toContain("width: 100%");
    expect(css).toContain("max-width: 100%");
    expect(css).toContain("margin-inline: auto");
    expect(css).toContain("box-sizing: border-box");
    expect(css).not.toMatch(/transform\s*:/);
    expect(css).not.toMatch(/translateX/);

    const appearance = readWorkspaceFile("lib/clerk/appearance.ts");
    expect(appearance).not.toMatch(/cardBox/);
    expect(appearance).toContain('rootBox: "mx-auto w-full max-w-full"');
  });

  it("does not change SignIn / SignUp auth wiring", () => {
    const signIn = readWorkspaceFile("components/auth/sign-in-page-client.tsx");
    expect(signIn).toContain("AuthShell");
    expect(signIn).toContain("<SignIn");
    expect(signIn).toContain('routing="path"');
    expect(signIn).toContain('path="/sign-in"');
    expect(signIn).toContain('signUpUrl="/sign-up"');

    const signUpClient = readWorkspaceFile(
      "components/auth/sign-up-page-client.tsx",
    );
    expect(signUpClient).toContain("<SignUp");
    expect(signUpClient).toContain('routing="path"');
    expect(signUpClient).toContain('path="/sign-up"');
    expect(signUpClient).toContain('signInUrl="/sign-in"');

    const signUpPage = readWorkspaceFile("app/sign-up/[[...sign-up]]/page.tsx");
    expect(signUpPage).toContain("AuthShell");
    expect(signUpPage).toContain("SignUpPageClient");
  });

  it("documents the Clerk default cardBox overflow against the frame", () => {
    for (const viewport of VIEWPORTS) {
      const broken = measureAuthShellLayout(viewport, {
        clerkCardBoxWidth: CLERK_DEFAULT_CARD_BOX,
        constrainToFrame: false,
      });
      const innerWidth = broken.frameWidth - framePaddingX(viewport) * 2;
      expect(CLERK_DEFAULT_CARD_BOX).toBeGreaterThan(innerWidth);
      expect(broken.clerkCenter).not.toBe(broken.frameCenter);
      expect(broken.overflowX).toBe(true);
    }
  });

  it("keeps both cards on the same center line at required viewports", () => {
    for (const viewport of VIEWPORTS) {
      const layout = measureAuthShellLayout(viewport, {
        clerkCardBoxWidth: CLERK_DEFAULT_CARD_BOX,
        constrainToFrame: true,
      });

      expect(layout.columnCenter).toBe(viewport / 2);
      expect(layout.frameCenter).toBe(layout.columnCenter);
      expect(layout.clerkCenter).toBe(layout.frameCenter);
      expect(layout.leftGutter).toBe(layout.rightGutter);
      expect(layout.leftGutter).toBeGreaterThan(0);
      expect(layout.clerkWidth).toBeLessThanOrEqual(layout.frameWidth);
      expect(layout.overflowX).toBe(false);
    }
  });
});
