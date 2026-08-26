"use client";

import * as React from "react";
import type { ReactNode } from "react";

type ViewTransitionComponent = React.ComponentType<{
  children?: ReactNode;
  name?: string;
  default?: string;
}>;

const ViewTransition = (
  React as typeof React & { ViewTransition?: ViewTransitionComponent }
).ViewTransition;

type AppViewTransitionProps = {
  children: ReactNode;
  /** Stable shared-element name. Do not key by pathname. */
  name?: string;
};

/**
 * Official React/Next View Transition boundary.
 * Children are not remounted — form drafts and scroll survive.
 */
export function AppViewTransition({ children, name }: AppViewTransitionProps) {
  if (!ViewTransition) {
    return <>{children}</>;
  }
  return (
    <ViewTransition name={name} default="minervot-page">
      {children}
    </ViewTransition>
  );
}
