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
} from "@/lib/motion/android-lite";
import { prefersReducedMotion } from "@/lib/motion/view-transition";
import { scheduleMountWork } from "@/lib/react/schedule-mount-work";

type MotionProfile = {
  lite: boolean;
  reduce: boolean;
};

const MotionProfileContext = createContext<MotionProfile>({
  lite: false,
  reduce: false,
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

export function MotionProvider({ children }: MotionProviderProps) {
  const [lite, setLite] = useState(false);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = (nextLite: boolean, nextReduce: boolean) => {
      setLite(nextLite);
      setReduce(nextReduce);
      document.documentElement.classList.toggle(MOTION_LITE_CLASS, nextLite);
    };
    const onChange = () => {
      apply(detectMotionLite(), media.matches);
    };
    media.addEventListener("change", onChange);
    const cancel = scheduleMountWork(() => {
      apply(detectMotionLite(), prefersReducedMotion());
    });
    return () => {
      cancel();
      media.removeEventListener("change", onChange);
      document.documentElement.classList.remove(MOTION_LITE_CLASS);
    };
  }, []);

  const value = useMemo(() => ({ lite, reduce }), [lite, reduce]);

  return (
    <MotionProfileContext.Provider value={value}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </MotionProfileContext.Provider>
  );
}
