"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { FIRST_OFFER_CONTENT_ID } from "@/lib/growth/first-revenue/constants";
import { offerSignupHref } from "@/lib/growth/first-revenue/offer";

function tracking() {
  if (typeof window === "undefined") {
    return { contentId: FIRST_OFFER_CONTENT_ID };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    contentId: params.get("contentId") ?? params.get("utm_content") ?? FIRST_OFFER_CONTENT_ID,
  };
}

export function FirstOfferActions() {
  useEffect(() => {
    void fetch("/api/growth/first-revenue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action: "view", ...tracking() }),
    }).catch(() => undefined);
  }, []);

  const signupHref = offerSignupHref();

  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href={signupHref}
        onClick={() => {
          void fetch("/api/growth/first-revenue", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ action: "cta", ...tracking() }),
          }).catch(() => undefined);
        }}
      >
        <Button>無料で投稿案を1件作る</Button>
      </Link>
      <Link href="/#pricing">
        <Button variant="secondary">有料プランを見る</Button>
      </Link>
    </div>
  );
}
