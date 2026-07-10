import { forwardRef } from "react";

import { cn } from "@/lib/design-system/cn";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string;
};

export function Input({
  label,
  hint,
  error,
  className,
  id,
  ...props
}: InputProps) {
  const inputId = id ?? label?.replace(/\s+/g, "-").toLowerCase();

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-2 block text-sm text-[var(--text-secondary)]">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          "h-11 w-full rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-4 text-base text-foreground placeholder:text-[var(--text-muted)] transition-colors duration-[var(--motion-fast)] focus:outline-none focus:ring-2 focus:ring-accent/30",
          error && "ring-2 ring-[var(--status-error)]/25",
          className,
        )}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {hint && !error && <p className="mt-2 text-caption">{hint}</p>}
      {error && (
        <p className="mt-2 text-sm text-[var(--status-error)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  hint?: string;
  error?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ label, hint, error, className, id, ...props }, ref) {
  const inputId = id ?? label?.replace(/\s+/g, "-").toLowerCase();

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-2 block text-sm text-[var(--text-secondary)]">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={inputId}
        className={cn(
          "min-h-[120px] w-full resize-y rounded-[var(--radius-xl)] bg-[var(--surface-muted)] px-4 py-3 text-base leading-relaxed text-foreground placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-accent/30",
          error && "ring-2 ring-[var(--status-error)]/25",
          className,
        )}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {hint && !error && <p className="mt-2 text-caption">{hint}</p>}
      {error && (
        <p className="mt-2 text-sm text-[var(--status-error)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
  },
);
