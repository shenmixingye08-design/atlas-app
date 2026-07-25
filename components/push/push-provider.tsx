"use client";

import { useEffect } from "react";

import { registerServiceWorker } from "@/lib/push/client";

/** Registers SW once on app load (no double registration). */
export function PushProvider() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void registerServiceWorker().catch(() => undefined);
  }, []);

  return null;
}
