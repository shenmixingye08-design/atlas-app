import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("AuthShell Clerk card centering contract", () => {
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

  it("centers Clerk on the frame without stretching or magic offsets", () => {
    const css = readWorkspaceFile("components/auth/auth-shell.css");
    expect(css).toContain(".auth-shell-column");
    expect(css).toContain("display: grid");
    expect(css).toContain("place-items: center");
    expect(css).toContain(".auth-card-frame > *");
    expect(css).toContain(".auth-card-frame .cl-rootBox");
    expect(css).toContain(".auth-card-frame .cl-cardBox");
    expect(css).toContain(".auth-card-frame .cl-card");
    expect(css).toContain("margin-inline: auto");
    expect(css).toContain("left: auto");
    expect(css).toContain("right: auto");
    expect(css).toContain("box-sizing: border-box");
    expect(css).toContain("width: auto");
    expect(css).not.toMatch(/transform\s*:/);
    expect(css).not.toMatch(/translateX/);
    expect(css).not.toMatch(/margin-left:\s*-/);
    expect(css).not.toMatch(/left:\s*\d+px/);

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
});
