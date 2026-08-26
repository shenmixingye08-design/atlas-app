"use client";

import { useEffect, useRef } from "react";

function readParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

/**
 * UTM / contentId 付きで LP・登録ページに着地した訪問を記録する。
 * 通常流入（パラメータなし）は送らない。
 */
export function GrowthVisitCapture() {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    const contentId = readParam("contentId") ?? readParam("utm_content");
    if (!contentId) return;
    sent.current = true;
    void fetch("/api/growth/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        eventName: "link_clicked",
        contentId,
        campaignId: readParam("campaignId") ?? readParam("utm_campaign"),
        source: readParam("utm_source"),
        medium: readParam("utm_medium"),
      }),
    }).catch(() => {
      sent.current = false;
    });
  }, []);

  return null;
}
