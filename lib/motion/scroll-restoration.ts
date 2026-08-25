"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const SCROLL_KEY = "atlas.scroll:";
const POP_KEY = "atlas.nav:pop";

function storageGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* private mode / quota — ignore */
  }
}

function storageRemove(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Remember window scroll per path and restore only on back/forward.
 * Forward navigations keep Next.js default (scroll to top).
 * Does not remount page trees or touch form state.
 */
export function usePathScrollRestoration() {
  const pathname = usePathname() ?? "";

  useEffect(() => {
    const onPop = () => storageSet(POP_KEY, "1");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const isPop = storageGet(POP_KEY) === "1";
    storageRemove(POP_KEY);

    if (isPop) {
      const raw = storageGet(`${SCROLL_KEY}${pathname}`);
      const y = raw ? Number(raw) : NaN;
      if (Number.isFinite(y) && y >= 0) {
        const restore = () => window.scrollTo({ top: y, left: 0 });
        restore();
        const frame = window.requestAnimationFrame(restore);
        return () => window.cancelAnimationFrame(frame);
      }
    }

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        storageSet(`${SCROLL_KEY}${pathname}`, String(window.scrollY));
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);
}
