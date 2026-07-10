"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ui } from "@/lib/i18n";

export function OfflineWatcher() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[100] border-t border-[var(--border-subtle)] bg-[var(--terms-bg)]/95 px-4 py-3 backdrop-blur-md"
      role="status"
    >
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-[var(--terms-heading)]">{ui.systemPages.offlineBanner}</p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-white"
            onClick={() => window.location.reload()}
          >
            {ui.systemPages.reconnect}
          </button>
          <Link href="/offline" className="text-[var(--terms-accent)] hover:underline">
            {ui.systemPages.offlineDetails}
          </Link>
        </div>
      </div>
    </div>
  );
}
