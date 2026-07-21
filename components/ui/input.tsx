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
          "minervot-form-control h-11 w-full rounded-[var(--radius-lg)] border border-[var(--form-control-border,var(--border))] bg-[var(--form-control-bg,var(--surface-muted))] px-4 text-base text-[var(--form-control-text,var(--text-primary))] placeholder:text-[var(--form-control-muted,var(--text-muted))] transition-colors duration-[var(--motion-fast)] focus:border-[var(--form-control-focus,var(--accent))] focus:outline-none focus:ring-2 focus:ring-[var(--form-control-focus,var(--accent))]/25",
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
          "minervot-form-control min-h-[120px] w-full resize-y rounded-[var(--radius-xl)] border border-[var(--form-control-border,var(--border))] bg-[var(--form-control-bg,var(--surface-muted))] px-4 py-3 text-base leading-relaxed text-[var(--form-control-text,var(--text-primary))] placeholder:text-[var(--form-control-muted,var(--text-muted))] focus:border-[var(--form-control-focus,var(--accent))] focus:outline-none focus:ring-2 focus:ring-[var(--form-control-focus,var(--accent))]/25",
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
