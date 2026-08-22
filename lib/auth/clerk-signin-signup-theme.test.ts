import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("SignIn / SignUp Clerk theme wiring", () => {
  it("SignIn follows the resolved theme without changing auth routing", () => {
    const src = readWorkspaceFile("components/auth/sign-in-page-client.tsx");
    expect(src).toContain("useThemedClerkAppearance");
    expect(src).not.toContain("atlasClerkAppearance");
    expect(src).toContain('routing="path"');
    expect(src).toContain('path="/sign-in"');
    expect(src).toContain('signUpUrl="/sign-up"');
    expect(src).toContain("forceRedirectUrl={redirectUrl}");
    expect(src).toContain("fallbackRedirectUrl={ATLAS_APP_HOME_PATH}");
    expect(src).toContain("SignInTicketConsumer");
    expect(src).toContain('searchParams.get("redirect_url")');
  });

  it("SignUp follows the resolved theme without changing auth routing", () => {
    const client = readWorkspaceFile("components/auth/sign-up-page-client.tsx");
    expect(client).toContain("useThemedClerkAppearance");
    expect(client).not.toContain("atlasClerkAppearance");
    expect(client).toContain('routing="path"');
    expect(client).toContain('path="/sign-up"');
    expect(client).toContain('signInUrl="/sign-in"');
    expect(client).toContain("forceRedirectUrl={ATLAS_APP_HOME_PATH}");
    expect(client).toContain("fallbackRedirectUrl={ATLAS_APP_HOME_PATH}");

    const page = readWorkspaceFile("app/sign-up/[[...sign-up]]/page.tsx");
    expect(page).toContain("SignUpPageClient");
    expect(page).not.toContain("atlasClerkAppearance");
    expect(page).not.toContain("from \"@clerk/nextjs\"");
    expect(page).toContain("無料で1回試す");
  });

  it("reuses ThemeProvider instead of a second theme store", () => {
    const hook = readWorkspaceFile(
      "components/auth/use-themed-clerk-appearance.ts",
    );
    expect(hook).toContain('from "@/components/theme/theme-provider"');
    expect(hook).toContain("useTheme");
    expect(hook).toContain("getAtlasClerkAppearance(resolved)");
  });
});
