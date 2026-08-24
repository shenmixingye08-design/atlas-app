import { cookies } from "next/headers";

import { isAtlasProduction } from "@/lib/runtime/is-production";

import { createVisitorId } from "./attribution";
import { GROWTH_VISITOR_COOKIE } from "./constants";

const MAX_AGE_SEC = 30 * 24 * 60 * 60;

export function visitorCookieOptions(): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isAtlasProduction(),
    path: "/",
    maxAge: MAX_AGE_SEC,
  };
}

export async function readVisitorIdFromCookie(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(GROWTH_VISITOR_COOKIE)?.value?.trim();
  if (!value || !value.startsWith("vid_")) return null;
  return value;
}

export async function ensureVisitorIdCookie(): Promise<string> {
  const existing = await readVisitorIdFromCookie();
  if (existing) return existing;
  const visitorId = createVisitorId();
  const store = await cookies();
  store.set(GROWTH_VISITOR_COOKIE, visitorId, visitorCookieOptions());
  return visitorId;
}
