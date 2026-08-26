import { getSiteOrigin } from "@/lib/seo/site";

import {
  ALLOWED_GROWTH_PATHS,
  DEFAULT_GROWTH_PATH,
  type AllowedGrowthPath,
} from "./constants";

function isAllowedPath(pathname: string): pathname is AllowedGrowthPath {
  return (ALLOWED_GROWTH_PATHS as readonly string[]).includes(pathname);
}

/**
 * リポジトリに実在する / と /sign-up だけを許可する。
 * /pricing は既存どおり /#pricing へ寄せる（app/pricing の導線）。
 */
export function normalizeGrowthPath(lpUrl: string): AllowedGrowthPath {
  const raw = lpUrl.trim();
  if (!raw) return DEFAULT_GROWTH_PATH;

  if (raw === "/pricing" || raw === "/#pricing" || raw.endsWith("#pricing")) {
    return "/";
  }

  if (raw.startsWith("/")) {
    const path = raw.split("?")[0]?.split("#")[0] ?? DEFAULT_GROWTH_PATH;
    return isAllowedPath(path) ? path : DEFAULT_GROWTH_PATH;
  }

  try {
    const url = new URL(raw);
    const path = url.pathname.replace(/\/$/, "") || "/";
    if (path === "/pricing") return "/";
    if (isAllowedPath(path)) return path;
  } catch {
    // fall through
  }

  return DEFAULT_GROWTH_PATH;
}

export function resolveGrowthOrigin(origin?: string): string {
  const configured = origin?.trim() || getSiteOrigin();
  return configured.replace(/\/$/, "");
}

export function resolveGrowthDestination(input: {
  lpUrl: string;
  origin?: string;
}): URL {
  const origin = resolveGrowthOrigin(input.origin);
  const path = normalizeGrowthPath(input.lpUrl);
  const url = new URL(path, `${origin}/`);
  if (input.lpUrl.includes("#pricing") || input.lpUrl.endsWith("/pricing")) {
    url.hash = "pricing";
  }
  return url;
}
