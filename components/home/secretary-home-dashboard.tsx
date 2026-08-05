"use client";

import type { Automation } from "@/lib/automations/types";
import type { Project } from "@/lib/projects/types";

import { HomeChatBar } from "./home-chat-bar";

type SecretaryHomeDashboardProps = {
  automations: Automation[];
  projects: Project[];
};

/**
 * Phase1 home — only brand, ask, input, submit.
 * No greetings, attachments chrome, format pickers, or feature catalogs.
 */
export function SecretaryHomeDashboard({
  automations,
  projects,
}: SecretaryHomeDashboardProps) {
  void automations;
  void projects;

  return (
    <div className="home-dashboard mx-auto flex min-h-[70vh] w-full max-w-xl flex-col justify-center space-y-10 pb-16 pt-8 sm:pb-20 sm:pt-12">
      <p className="text-center text-sm font-semibold tracking-[0.2em] text-foreground">
        MINERVOT
      </p>
      <HomeChatBar />
    </div>
  );
}
