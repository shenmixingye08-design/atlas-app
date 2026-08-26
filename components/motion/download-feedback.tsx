"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { ErrorState } from "@/components/ui/error-state";
import { SuccessState } from "@/components/ui/success-state";
import { MOTION_REDUCED, MOTION_TRANSITION } from "@/lib/motion/tokens";

type DownloadFeedbackProps = {
  done: boolean;
  error: string | null;
  doneMessage: string;
};

export function DownloadFeedback({
  done,
  error,
  doneMessage,
}: DownloadFeedbackProps) {
  const reduce = useReducedMotion();

  return (
    <AnimatePresence initial={false}>
      {done ? (
        <motion.div
          key="done"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={reduce ? MOTION_REDUCED : MOTION_TRANSITION.base}
        >
          <SuccessState message={doneMessage} />
        </motion.div>
      ) : null}
      {error ? (
        <motion.div
          key="error"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={reduce ? MOTION_REDUCED : MOTION_TRANSITION.base}
        >
          <ErrorState message={error} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
