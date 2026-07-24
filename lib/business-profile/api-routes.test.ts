import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  userId: "user_a" as string | null,
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: authState.userId })),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClientIfConfigured: vi.fn(() => null),
}));

import {
  GET as getProfiles,
  POST as createProfileRoute,
} from "@/app/api/business-profiles/route";
import {
  DELETE as deleteProfileRoute,
  GET as getProfileRoute,
  PATCH as updateProfileRoute,
} from "@/app/api/business-profiles/[id]/route";
import { POST as createContactRoute } from "@/app/api/business-contacts/route";
import { GET as exportProfilesRoute } from "@/app/api/business-profiles/export/route";
import { resetBusinessProfileRepositoryForTests } from "./store";

function jsonRequest(url: string, body: unknown, init?: RequestInit): Request {
  return new Request(url, {
    method: init?.method ?? "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...init,
  });
}

async function createProfile(companyName: string): Promise<{ id: string }> {
  const response = await createProfileRoute(
    jsonRequest("http://localhost/api/business-profiles", {
      companyName,
      ownerUserId: "client_supplied_owner_must_be_ignored",
      bankAccountNumber: "1234567",
    }),
  );
  expect(response.status).toBe(201);
  const body = (await response.json()) as { profile: { id: string } };
  return { id: body.profile.id };
}

beforeEach(() => {
  authState.userId = "user_a";
  resetBusinessProfileRepositoryForTests();
});

describe("business profile API ownership", () => {
  it("uses Clerk userId for create/list and ignores client ownerUserId", async () => {
    await createProfile("株式会社A");

    authState.userId = "user_b";
    const otherList = await getProfiles();
    expect(otherList.status).toBe(200);
    expect(await otherList.json()).toEqual({ profiles: [] });

    authState.userId = "user_a";
    const ownerList = await getProfiles();
    const body = (await ownerList.json()) as {
      profiles: Array<{ companyName: string; bankAccountNumberMasked: string | null }>;
    };
    expect(body.profiles).toHaveLength(1);
    expect(body.profiles[0]?.companyName).toBe("株式会社A");
    expect(body.profiles[0]?.bankAccountNumberMasked).toBe("••••4567");
  });

  it("blocks cross-user profile read, update, delete, and related contact create", async () => {
    const profile = await createProfile("株式会社A");
    const context = { params: Promise.resolve({ id: profile.id }) };

    authState.userId = "user_b";
    expect(
      (await getProfileRoute(new Request("http://localhost"), context)).status,
    ).toBe(404);
    expect(
      (
        await updateProfileRoute(
          jsonRequest("http://localhost", { companyName: "株式会社B" }, { method: "PATCH" }),
          context,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await deleteProfileRoute(
          jsonRequest("http://localhost", { switchToProfileId: null }, { method: "DELETE" }),
          context,
        )
      ).status,
    ).toBe(404);

    const contactResponse = await createContactRoute(
      jsonRequest("http://localhost/api/business-contacts", {
        profileId: profile.id,
        displayName: "取引先",
      }),
    );
    expect(contactResponse.status).toBe(409);
  });

  it("does not export full bank account numbers", async () => {
    await createProfile("株式会社A");

    const response = await exportProfilesRoute();
    expect(response.status).toBe(200);
    const text = JSON.stringify(await response.json());
    expect(text).toContain("••••4567");
    expect(text).not.toContain("1234567");
  });
});
