"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect, useRef } from "react";

/**
 * Clerk 登録後に visitor cookie と userId をサーバー側で紐付ける。
 * 秘密鍵は置かない。再ログインはサーバーが新規登録として数えない。
 */
export function AttributionBinder() {
  const { isSignedIn } = useUser();
  const sent = useRef(false);

  useEffect(() => {
    if (!isSignedIn || sent.current) return;
    sent.current = true;
    void fetch("/api/growth/attribution/bind", {
      method: "POST",
      credentials: "same-origin",
    }).catch(() => {
      sent.current = false;
    });
  }, [isSignedIn]);

  return null;
}
