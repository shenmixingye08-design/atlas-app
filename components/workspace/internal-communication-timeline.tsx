"use client";

import { useEffect, useRef } from "react";

import type { InternalMessage } from "@/lib/workspace/internal-messages";
import { formatInternalMessageTime } from "@/lib/workspace/internal-messages";
import { ui } from "@/lib/i18n";
import { Card } from "@/components/ui/card";

type InternalCommunicationTimelineProps = {
  messages: InternalMessage[];
};

export function InternalCommunicationTimeline({
  messages,
}: InternalCommunicationTimelineProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length]);

  if (messages.length === 0) {
    return null;
  }

  return (
    <Card padding="md" className="animate-fade-in">
      <h3 className="text-overline">{ui.internalComms.title}</h3>
      <ul
        className="mt-5 max-h-80 space-y-5 overflow-y-auto pr-1"
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.map((message, index) => (
          <li
            key={message.id}
            className="flex gap-3 animate-comm-in"
            style={{ animationDelay: `${Math.min(index * 35, 280)}ms` }}
          >
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--background-subtle)] text-lg"
              aria-hidden="true"
            >
              {message.avatar}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm font-medium text-foreground">
                  {message.employeeName}
                </span>
                <span className="text-caption">{message.departmentLabel}</span>
                <span className="text-caption tabular-nums">
                  {formatInternalMessageTime(message.offsetMs)}
                </span>
              </div>
              <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-foreground">
                {message.message}
              </p>
              <div className="mt-2.5">
                <p className="text-caption">{ui.internalComms.reasonLabel}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-[var(--foreground-subtle)]">
                  {message.reason}
                </p>
              </div>
              {message.handoff && (
                <div className="mt-3 space-y-2.5">
                  <div>
                    <p className="text-caption">
                      {ui.internalComms.nextAssigneeLabel}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--foreground-muted)]">
                      {message.handoff.nextDepartment}
                    </p>
                  </div>
                  <div>
                    <p className="text-caption">
                      {ui.internalComms.nextRequestLabel}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-[var(--foreground-subtle)]">
                      {message.handoff.request}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </li>
        ))}
        <div ref={endRef} />
      </ul>
    </Card>
  );
}
