import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { getClerkUserPrimaryEmail } from "@/lib/auth/get-clerk-user-email";
import { isAtlasOwnerEmail } from "@/lib/auth/is-atlas-owner";
import {
  ATLAS_LOGIN_CONTINUE_NOTICE,
  ATLAS_PROTECTED_PAGE_MATCHERS,
  ATLAS_PUBLIC_API_MATCHERS,
} from "@/lib/auth/public-routes";

/** ログイン必須の画面ルート */
const isProtectedPage = createRouteMatcher([...ATLAS_PROTECTED_PAGE_MATCHERS]);

/** 公開 API（Webhook・ステータス・料金プラン一覧・お問い合わせ等） */
const isPublicApi = createRouteMatcher([...ATLAS_PUBLIC_API_MATCHERS]);

/** その他 API はログイン必須 */
const isApiRoute = createRouteMatcher(["/api(.*)"]);

/** Owner dashboard and owner APIs — ATLAS operators only. */
const isOwnerRoute = createRouteMatcher(["/owner(.*)", "/api/owner(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  const pathname = request.nextUrl.pathname;

  // ホームページ等の公開ページは protect しない（表示速度を優先）
  if (pathname === "/" || pathname.startsWith("/_next")) {
    return;
  }

  if (isPublicApi(request)) {
    return;
  }

  if (isProtectedPage(request) || (isApiRoute(request) && !isPublicApi(request))) {
    const { userId } = await auth();

    if (!userId) {
      // API は 401（JSON）。ページはログインへリダイレクト＋案内
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const signInUrl = new URL("/sign-in", request.url);
      const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
      signInUrl.searchParams.set("redirect_url", returnTo);
      signInUrl.searchParams.set("notice", ATLAS_LOGIN_CONTINUE_NOTICE);
      return NextResponse.redirect(signInUrl);
    }
  }

  if (isOwnerRoute(request)) {
    await auth.protect();

    const { userId } = await auth();
    const email = userId ? await getClerkUserPrimaryEmail(userId) : null;

    if (!isAtlasOwnerEmail(email)) {
      if (request.nextUrl.pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      return NextResponse.redirect(new URL("/", request.url));
    }
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
