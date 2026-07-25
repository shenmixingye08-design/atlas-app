import { describe, expect, it } from "vitest";

import { BusinessProfileError } from "./errors";
import {
  durableWriteError,
  isSchemaMissingError,
  storageStatusFromError,
  throwIfDurableWriteFailed,
} from "./durable-errors";

describe("business profile durable errors", () => {
  it("detects missing migration / relation errors", () => {
    expect(
      isSchemaMissingError({
        message: 'relation "atlas_business_profiles" does not exist',
        code: "42P01",
      }),
    ).toBe(true);
    expect(
      isSchemaMissingError({
        message: "Could not find the table 'public.atlas_business_profiles' in the schema cache",
      }),
    ).toBe(true);
    expect(isSchemaMissingError({ message: "permission denied" })).toBe(false);
  });

  it("maps schema missing writes to a clear Japanese BusinessProfileError", () => {
    const error = durableWriteError("create profile", {
      message: 'relation "atlas_business_profiles" does not exist',
    });
    expect(error).toBeInstanceOf(BusinessProfileError);
    expect(error.code).toBe("schema_missing");
    expect(error.message).toContain("Migration");
  });

  it("throws on write failure so APIs do not fake success", () => {
    expect(() =>
      throwIfDurableWriteFailed("create profile", {
        message: 'relation "atlas_business_profiles" does not exist',
      }),
    ).toThrow(BusinessProfileError);
  });

  it("keeps list reads non-fatal via storage status", () => {
    expect(storageStatusFromError(null)).toEqual({ ok: true });
    const status = storageStatusFromError({
      message: 'relation "atlas_business_profiles" does not exist',
    });
    expect(status.ok).toBe(false);
    if (!status.ok) {
      expect(status.code).toBe("schema_missing");
      expect(status.message).toContain("Migration");
    }
  });
});
