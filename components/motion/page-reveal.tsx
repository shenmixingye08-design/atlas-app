"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/design-system/cn";
import { MOTION_MS, MOTION_SCALE, pageTravelY } from "@/lib/motion/tokens";

type PageRevealProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Visible fade + rise + slight scale on first paint and every route change.
 * Always replays even when View Transitions exist — Android Chrome VT is
 * often an invisible crossfade. Children are not remounted.
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

    if (reduce) {
      first.current = false;
      const fade = node.animate([{ opacity: 0.96 }, { opacity: 1 }], {
        duration: 80,
        easing: "linear",
        fill: "both",
      });
      return () => fade.cancel();
    }

    const lite = document.documentElement.classList.contains("motion-lite");
    const y = pageTravelY(lite);
    const fromScale = MOTION_SCALE.page;
    const replay = !first.current;
    first.current = false;

    const intro = node.animate(
      [
        {
          opacity: replay ? 0.08 : 0,
          transform: `translateY(${y}px) scale(${fromScale})`,
        },
        { opacity: 1, transform: "translateY(0) scale(1)" },
      ],
      {
        duration: MOTION_MS.page,
        easing: "cubic-bezier(0.25, 0.1, 0.25, 1)",
        fill: "both",
      },
    );
    return () => intro.cancel();
  }, [pathname]);

  return (
    <div ref={ref} className={cn("min-w-0", className)}>
      {children}
    </div>
  );
}
