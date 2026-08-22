import "server-only";

import { clerkClient } from "@clerk/nextjs/server";

export type RegisteredUserCountResult = {
  source: "clerk";
  availability: "ok" | "failed" | "disconnected";
  total: number | null;
  fetchedAt: string | null;
  statusMessage: string | null;
};

function clerkSecretConfigured(): boolean {
  return Boolean(process.env.CLERK_SECRET_KEY?.trim());
}

/**
 * Registered MINERVOT users. Clerk is the auth source of truth —
 * there is no separate durable user-registry table that is more complete.
 * Owner-only / server-side. Never invents 0 on failure.
 */
export async function fetchRegisteredUserCount(): Promise<RegisteredUserCountResult> {
  const fetchedAt = new Date().toISOString();

  if (!clerkSecretConfigured()) {
    return {
      source: "clerk",
      availability: "disconnected",
      total: null,
      fetchedAt: null,
      statusMessage: "Clerk未接続（登録ユーザー数を取得できません）",
    };
  }

  try {
    const client = await clerkClient();
    const users = client.users as {
      getCount?: (params?: Record<string, unknown>) => Promise<number>;
      getUserList?: (params?: {
        limit?: number;
        offset?: number;
      }) => Promise<{ totalCount?: number; data?: unknown[] }>;
    };

    if (typeof users.getCount === "function") {
      const total = await users.getCount();
      if (typeof total !== "number" || !Number.isFinite(total) || total < 0) {
        return {
          source: "clerk",
          availability: "failed",
          total: null,
          fetchedAt,
          statusMessage: "登録ユーザー数の取得に失敗しました",
        };
      }
      return {
        source: "clerk",
        availability: "ok",
        total,
        fetchedAt,
        statusMessage: null,
      };
    }

    if (typeof users.getUserList === "function") {
      const page = await users.getUserList({ limit: 1, offset: 0 });
      if (typeof page.totalCount === "number" && Number.isFinite(page.totalCount)) {
        return {
          source: "clerk",
          availability: "ok",
          total: page.totalCount,
          fetchedAt,
          statusMessage: null,
        };
      }
    }

    return {
      source: "clerk",
      availability: "failed",
      total: null,
      fetchedAt,
      statusMessage: "Clerkユーザー件数APIを利用できません",
    };
  } catch {
    return {
      source: "clerk",
      availability: "failed",
      total: null,
      fetchedAt,
      statusMessage: "登録ユーザー数の取得に失敗しました",
    };
  }
}
