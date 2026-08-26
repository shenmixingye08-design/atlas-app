"use client";

import { MotionConfig } from "motion/react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  detectMotionLite,
  MOTION_LITE_CLASS,
  MOTION_MODE_ATTR,
  resolveMotionMode,
  type MotionMode,
} from "@/lib/motion/android-lite";
import { resetMotionPlayState } from "@/lib/motion/play-once";
import { prefersReducedMotion } from "@/lib/motion/view-transition";
import { scheduleMountWork } from "@/lib/react/schedule-mount-work";

type MotionProfile = {
  lite: boolean;
  reduce: boolean;
  mode: MotionMode;
};

const MotionProfileContext = createContext<MotionProfile>({
  lite: false,
  reduce: false,
  mode: "full",
});

export function useMotionProfile(): MotionProfile {
  return useContext(MotionProfileContext);
}

export function useMotionLite(): boolean {
  return useMotionProfile().lite;
}

type MotionProviderProps = {
  children: ReactNode;
};

const IS_PROD = process.env.NODE_ENV === "production";

function applyDocumentMode(lite: boolean, reduce: boolean): MotionMode {
  const mode = resolveMotionMode(lite, reduce);
  const root = document.documentElement;
  root.classList.toggle(MOTION_LITE_CLASS, lite && !reduce);
  root.setAttribute(MOTION_MODE_ATTR, mode);
  return mode;
}

function readDebugFlag(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("motion") === "debug";
  } catch {
    return false;
  }
}

function shouldReplayMotion(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("motionReplay") === "1";
  } catch {
    return false;
  }
}

export function MotionProvider({ children }: MotionProviderProps) {
  const [lite, setLite] = useState(false);
  const [reduce, setReduce] = useState(false);
  const [debug, setDebug] = useState(false);
  const mode = resolveMotionMode(lite, reduce);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = (nextLite: boolean, nextReduce: boolean) => {
      setLite(nextLite);
      setReduce(nextReduce);
      const nextMode = applyDocumentMode(nextLite, nextReduce);
      if (!IS_PROD) {
        const w = window as Window & {
          __MINERVOT_MOTION_MODE__?: MotionMode;
          __MINERVOT_RESET_MOTION__?: () => void;
        };
        w.__MINERVOT_MOTION_MODE__ = nextMode;
        w.__MINERVOT_RESET_MOTION__ = resetMotionPlayState;
      }
    };
    const onChange = () => {
      apply(detectMotionLite(), media.matches);
    };
    media.addEventListener("change", onChange);
    const cancel = scheduleMountWork(() => {
      if (!IS_PROD && shouldReplayMotion()) {
        resetMotionPlayState();
      }
      apply(detectMotionLite(), prefersReducedMotion());
      if (!IS_PROD) setDebug(readDebugFlag());
    });
    return () => {
      cancel();
      media.removeEventListener("change", onChange);
      document.documentElement.classList.remove(MOTION_LITE_CLASS);
      document.documentElement.removeAttribute(MOTION_MODE_ATTR);
    };
  }, []);

  const value = useMemo(
    () => ({ lite, reduce, mode }),
    [lite, reduce, mode],
  );

  return (
    <MotionProfileContext.Provider value={value}>
      <MotionConfig reducedMotion="user">
        {children}
        {!IS_PROD && debug ? <MotionModeBadge mode={mode} /> : null}
      </MotionConfig>
    </MotionProfileContext.Provider>
  );
}

function MotionModeBadge({ mode }: { mode: MotionMode }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed bottom-[calc(var(--safe-area-bottom,0px)+4.75rem)] left-2 z-[80] rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-medium tracking-wide text-white md:bottom-3"
    >
      motion:{mode}
    </div>
  );
}
