import { describe, expect, it } from "vitest";

import {
  getMissingGoogleScopes,
  hasGoogleCapability,
  parseGoogleScopeString,
} from "@/lib/integrations/google/scopes";

describe("Google OAuth scopes", () => {
  it("parses space-separated scopes", () => {
    const scopes = parseGoogleScopeString(
      "email https://www.googleapis.com/auth/gmail.modify profile",
    );
    expect(scopes.has("email")).toBe(true);
    expect(scopes.has("https://www.googleapis.com/auth/gmail.modify")).toBe(
      true,
    );
  });

  it("detects gmail capability", () => {
    expect(
      hasGoogleCapability(
        "https://www.googleapis.com/auth/gmail.modify",
        "gmail",
      ),
    ).toBe(true);
    expect(hasGoogleCapability("email profile", "gmail")).toBe(false);
  });

  it("detects calendar capability from events or readonly", () => {
    expect(
      hasGoogleCapability(
        "https://www.googleapis.com/auth/calendar.events",
        "calendar",
      ),
    ).toBe(true);
    expect(
      hasGoogleCapability(
        "https://www.googleapis.com/auth/calendar.readonly",
        "calendar",
      ),
    ).toBe(true);
    expect(hasGoogleCapability("email", "calendar")).toBe(false);
  });

  it("lists missing scopes", () => {
    expect(
      getMissingGoogleScopes("email", [
        "https://www.googleapis.com/auth/gmail.modify",
      ]),
    ).toEqual(["https://www.googleapis.com/auth/gmail.modify"]);
  });
});
