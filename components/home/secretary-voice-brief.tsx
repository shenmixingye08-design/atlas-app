"use client";

import type { SecretaryVoiceBrief } from "@/lib/home/secretary-voice";

type SecretaryVoiceBriefPanelProps = {
  brief: SecretaryVoiceBrief;
};

export function SecretaryVoiceBriefPanel({ brief }: SecretaryVoiceBriefPanelProps) {
  const blocks = [brief.greeting, ...brief.paragraphs, brief.closing].filter(
    (block) => block.trim().length > 0,
  );

  return (
    <section
      aria-labelledby="secretary-voice-heading"
      className="animate-fade-up rounded-[28px] border border-[var(--border-subtle)] bg-[var(--card)] px-5 py-6 shadow-[var(--shadow-sm)] sm:px-7 sm:py-7"
    >
      <p
        id="secretary-voice-heading"
        className="text-xs font-medium tracking-wide text-accent sm:text-sm"
      >
        AI秘書から一言
      </p>

      <div className="mt-4 space-y-0">
        {blocks.map((block, index) => (
          <div key={`${index}-${block.slice(0, 12)}`}>
            {index > 0 && (
              <div
                className="my-4 border-t border-[var(--border-subtle)]"
                aria-hidden
              />
            )}
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-foreground sm:text-base sm:leading-relaxed">
              {block}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
