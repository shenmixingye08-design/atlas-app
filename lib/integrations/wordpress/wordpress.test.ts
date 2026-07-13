import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetExternalServiceStore } from "@/lib/integrations/external-services/store";
import { getExternalServiceConnection } from "@/lib/integrations/external-services/store";
import {
  normalizeApplicationPassword,
  normalizeWordPressSiteUrl,
} from "@/lib/integrations/wordpress/config";
import {
  decryptWordPressSecret,
  encryptWordPressSecret,
} from "@/lib/integrations/wordpress/crypto";
import {
  connectWordPressAccount,
  disconnectWordPressAccount,
  getWordPressAuthContext,
} from "@/lib/integrations/wordpress/connection-service";
import { resetWordPressCredentialStore } from "@/lib/integrations/wordpress/credential-store";
import {
  createWordPressPostForUser,
  updateWordPressPostForUser,
} from "@/lib/integrations/wordpress/post/service";
import { buildFeatureAccessContext } from "@/lib/feature-flags/access";

const USER_A = "user_wp_a";
const USER_B = "user_wp_b";

function mockWpUsersMeOk() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/users/me")) {
      return new Response(
        JSON.stringify({ id: 1, name: "Editor", slug: "editor" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/posts") && !url.match(/\/posts\/\d+/)) {
      return new Response(
        JSON.stringify({
          id: 42,
          link: "https://example.com/?p=42",
          status: "draft",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.match(/\/posts\/\d+/)) {
      return new Response(
        JSON.stringify({
          id: 42,
          link: "https://example.com/?p=42",
          status: "publish",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/categories")) {
      return new Response(
        JSON.stringify([{ id: 1, name: "News", slug: "news", parent: 0, count: 2 }]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("/tags")) {
      return new Response(
        JSON.stringify([{ id: 3, name: "atlas", slug: "atlas", count: 1 }]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(JSON.stringify({ code: "rest_no_route" }), {
      status: 404,
    });
  });
}

describe("WordPress config helpers", () => {
  it("normalizes site URL (https, strip trailing slash)", () => {
    expect(normalizeWordPressSiteUrl("example.com/")).toBe("https://example.com");
    expect(normalizeWordPressSiteUrl("https://blog.example.com/path")).toBe(
      "https://blog.example.com",
    );
  });

  it("strips spaces from application passwords", () => {
    expect(normalizeApplicationPassword("abcd efgh ijkl mnop")).toBe(
      "abcdefghijklmnop",
    );
  });
});

describe("WordPress credential encryption", () => {
  beforeEach(() => {
    vi.stubEnv(
      "ATLAS_WORDPRESS_CREDENTIALS_ENCRYPTION_KEY",
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips secrets without leaking plaintext in ciphertext", () => {
    const secret = "xxxx xxxx xxxx xxxx xxxx xxxx";
    const encrypted = encryptWordPressSecret(secret);
    expect(encrypted).not.toContain("xxxx");
    expect(encrypted.split(":")).toHaveLength(3);
    expect(decryptWordPressSecret(encrypted)).toBe(secret);
  });
});

describe("WordPress connection + posting", () => {
  beforeEach(() => {
    resetExternalServiceStore();
    resetWordPressCredentialStore();
    vi.stubEnv(
      "ATLAS_WORDPRESS_CREDENTIALS_ENCRYPTION_KEY",
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    );
    vi.stubGlobal("fetch", mockWpUsersMeOk());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("connects, stores credentials server-side, and never exposes password on connection", async () => {
    const result = await connectWordPressAccount(USER_A, {
      siteUrl: "https://example.com",
      username: "editor",
      applicationPassword: "abcd efgh ijkl mnop qrst uvwx",
    });

    expect(result.connection.status).toBe("connected");
    expect(result.connection.account?.email).toBe("https://example.com");
    expect(result.connection.account?.username).toBe("editor");
    expect(JSON.stringify(result.connection)).not.toMatch(/abcdefghijklmnop/i);
    expect(JSON.stringify(result)).not.toMatch(/applicationPassword/i);

    const auth = getWordPressAuthContext(USER_A);
    expect(auth?.applicationPassword).toBe("abcdefghijklmnopqrstuvwx");
  });

  it("isolates credentials per user (no cross-user access)", async () => {
    await connectWordPressAccount(USER_A, {
      siteUrl: "https://a.example.com",
      username: "a-user",
      applicationPassword: "password-for-a-user-xxxx",
    });
    await connectWordPressAccount(USER_B, {
      siteUrl: "https://b.example.com",
      username: "b-user",
      applicationPassword: "password-for-b-user-yyyy",
    });

    expect(getWordPressAuthContext(USER_A)?.username).toBe("a-user");
    expect(getWordPressAuthContext(USER_B)?.username).toBe("b-user");
    expect(getWordPressAuthContext(USER_A)?.siteUrl).toBe("https://a.example.com");
    expect(getWordPressAuthContext("user_wp_other")).toBeNull();
  });

  it("marks auth failure on 401 during connect", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ code: "rest_forbidden", message: "Forbidden" }), {
          status: 401,
        }),
      ),
    );

    await expect(
      connectWordPressAccount(USER_A, {
        siteUrl: "https://example.com",
        username: "editor",
        applicationPassword: "bad-password-xxxxxxxxxxxx",
      }),
    ).rejects.toThrow(/認証/);

    expect(getExternalServiceConnection(USER_A, "wordpress").status).toBe("error");
  });

  it("disconnects and clears credentials", async () => {
    await connectWordPressAccount(USER_A, {
      siteUrl: "https://example.com",
      username: "editor",
      applicationPassword: "abcd efgh ijkl mnop qrst uvwx",
    });

    const disconnected = await disconnectWordPressAccount(USER_A);
    expect(disconnected.status).toBe("disconnected");
    expect(getWordPressAuthContext(USER_A)).toBeNull();
  });

  it("saves draft and updates posts for the connected user", async () => {
    await connectWordPressAccount(USER_A, {
      siteUrl: "https://example.com",
      username: "editor",
      applicationPassword: "abcd efgh ijkl mnop qrst uvwx",
    });

    const context = buildFeatureAccessContext(null);
    const draft = await createWordPressPostForUser({
      userId: USER_A,
      context,
      payload: {
        title: "下書きタイトル",
        content: "<p>本文</p>",
        status: "draft",
        categories: [1],
        tags: [3],
      },
    });

    expect(draft.status).toBe("draft_saved");
    expect(draft.postId).toBe(42);
    expect(draft.link).toContain("42");

    const updated = await updateWordPressPostForUser({
      userId: USER_A,
      context,
      postId: 42,
      payload: {
        title: "更新タイトル",
        content: "<p>更新本文</p>",
        status: "publish",
      },
    });
    expect(updated.status).toBe("updated");
  });

  it("rejects posting when not connected", async () => {
    const context = buildFeatureAccessContext(null);
    const result = await createWordPressPostForUser({
      userId: USER_A,
      context,
      payload: { title: "t", content: "c", status: "publish" },
    });
    expect(result.status).toBe("wp_not_connected");
  });

  it("validates empty title/content", async () => {
    await connectWordPressAccount(USER_A, {
      siteUrl: "https://example.com",
      username: "editor",
      applicationPassword: "abcd efgh ijkl mnop qrst uvwx",
    });
    const context = buildFeatureAccessContext(null);
    const result = await createWordPressPostForUser({
      userId: USER_A,
      context,
      payload: { title: " ", content: "", status: "draft" },
    });
    expect(result.status).toBe("validation_failed");
  });
});
