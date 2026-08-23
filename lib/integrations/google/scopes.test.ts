import { describe, expect, it } from "vitest";

import {
  getMissingGoogleScopes,
  hasGoogleCapability,
  parseGoogleScopeString,
  resolveGrantedGoogleScope,
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

  it("does not invent Drive permission from planned account scopes", () => {
    expect(resolveGrantedGoogleScope(undefined)).toBe("");
    expect(resolveGrantedGoogleScope("")).toBe("");
    expect(
      resolveGrantedGoogleScope(
        undefined,
        ["https://www.googleapis.com/auth/calendar.events"],
      ),
    ).toBe("https://www.googleapis.com/auth/calendar.events");
    expect(
      hasGoogleCapability(resolveGrantedGoogleScope(undefined), "drive"),
    ).toBe(false);
  });

  it("accepts full Drive or drive.file for drive capability", () => {
    expect(
      hasGoogleCapability("https://www.googleapis.com/auth/drive", "drive"),
    ).toBe(true);
    expect(
      hasGoogleCapability(
        "https://www.googleapis.com/auth/drive.file",
        "drive",
      ),
    ).toBe(true);
    expect(hasGoogleCapability("email profile", "drive")).toBe(false);
  });
});
