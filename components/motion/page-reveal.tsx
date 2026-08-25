"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/design-system/cn";
import { MOTION_MS, MOTION_Y } from "@/lib/motion/tokens";

type PageRevealProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Short fade + 4–8px rise on first paint and on route change.
 * Animates the wrapper only — children are not remounted, so form drafts
 * and client state survive in-page updates.
 */
export function PageReveal({ children, className }: PageRevealProps) {
  const pathname = usePathname() ?? "";
  const ref = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (first.current) {
      first.current = false;
      if (reduce) return;
      const intro = node.animate(
        [
          { opacity: 0, transform: `translateY(${MOTION_Y.page}px)` },
          { opacity: 1, transform: "translateY(0)" },
        ],
        {
          duration: MOTION_MS.page,
          easing: "cubic-bezier(0.25, 0.1, 0.25, 1)",
          fill: "both",
        },
      );
      return () => intro.cancel();
    }

    if (reduce) {
      const fade = node.animate([{ opacity: 0.96 }, { opacity: 1 }], {
        duration: 80,
        easing: "linear",
        fill: "both",
      });
      return () => fade.cancel();
    }

    const replay = node.animate(
      [
        { opacity: 0.92, transform: `translateY(${MOTION_Y.page}px)` },
        { opacity: 1, transform: "translateY(0)" },
      ],
      {
        duration: MOTION_MS.page,
        easing: "cubic-bezier(0.25, 0.1, 0.25, 1)",
        fill: "both",
      },
    );
    return () => replay.cancel();
  }, [pathname]);

  return (
    <div ref={ref} className={cn("min-w-0", className)}>
      {children}
    </div>
  );
}
