"use client";

import { ui } from "@/lib/i18n";

import { HomeChatBar } from "./home-chat-bar";

/**
 * Phase1 home — 5-second value: brand + ask + input + 任せる.
 * No greeting, hints, attachments, tutorials, or tool names.
 */
export function SecretaryHomeDashboard() {
  return (
    <div className="home-dashboard mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col justify-center space-y-10 pb-16 pt-8 sm:space-y-12 sm:pb-20 sm:pt-12">
      <header className="text-center">
        <p
          className="text-4xl font-semibold tracking-[0.08em] text-foreground sm:text-5xl"
          aria-label="MINERVOT"
        >
          {ui.secretaryHome.brandName}
        </p>
      </header>

      <HomeChatBar />
    </div>
  );
}
