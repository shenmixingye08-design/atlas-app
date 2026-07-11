"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import {
  CONTACT_CATEGORIES,
  isContactCategoryId,
  type ContactCategoryId,
  type ContactValidationError,
} from "@/lib/contact";
import { cn } from "@/lib/design-system/cn";
import { ui } from "@/lib/i18n";

type FormState = {
  name: string;
  email: string;
  category: ContactCategoryId;
  subject: string;
  message: string;
  website: string;
};

const INITIAL_FORM: FormState = {
  name: "",
  email: "",
  category: "service",
  subject: "",
  message: "",
  website: "",
};

function fieldError(
  errors: ContactValidationError[] | undefined,
  field: ContactValidationError["field"],
): string | undefined {
  return errors?.find((item) => item.field === field)?.message;
}

export function ContactForm({ className }: { className?: string }) {
  const searchParams = useSearchParams();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [fieldErrors, setFieldErrors] = useState<ContactValidationError[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const categoryOptions = useMemo(() => CONTACT_CATEGORIES, []);

  useEffect(() => {
    const raw = searchParams.get("category");
    if (raw && isContactCategoryId(raw)) {
      setForm((prev) => ({ ...prev, category: raw }));
    }
  }, [searchParams]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors([]);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        fieldErrors?: ContactValidationError[];
      };

      if (!payload.ok) {
        setFieldErrors(payload.fieldErrors ?? []);
        setFormError(payload.error ?? ui.contact.submitError);
        return;
      }

      setSubmitted(true);
      setForm(INITIAL_FORM);
    } catch {
      setFormError(ui.contact.submitError);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div
        className={cn(
          "contact-success rounded-2xl border border-[var(--border-subtle)] bg-[var(--terms-toc-hover-bg)] px-6 py-8 text-center shadow-[var(--shadow-sm)]",
          className,
        )}
        role="status"
      >
        <p className="text-lg font-semibold text-[var(--terms-heading)]">
          {ui.contact.successTitle}
        </p>
        <p className="mt-3 text-[15px] leading-7 text-[var(--terms-body)]">
          {ui.contact.successMessage}
        </p>
        <Button
          type="button"
          variant="secondary"
          className="mt-6"
          onClick={() => setSubmitted(false)}
        >
          {ui.contact.sendAnother}
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className={cn("space-y-5", className)}
      noValidate
    >
      <Input
        label={ui.contact.nameLabel}
        name="name"
        autoComplete="name"
        value={form.name}
        onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
        placeholder={ui.contact.namePlaceholder}
      />

      <Input
        label={ui.contact.emailLabel}
        name="email"
        type="email"
        required
        autoComplete="email"
        value={form.email}
        onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
        placeholder={ui.contact.emailPlaceholder}
        error={fieldError(fieldErrors, "email")}
      />

      <div className="w-full">
        <label htmlFor="contact-category" className="mb-2 block text-sm text-[var(--text-secondary)]">
          {ui.contact.categoryLabel}
        </label>
        <select
          id="contact-category"
          name="category"
          value={form.category}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              category: event.target.value as ContactCategoryId,
            }))
          }
          className={cn(
            "h-11 w-full rounded-[var(--radius-lg)] bg-[var(--surface-muted)] px-4 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30",
            fieldError(fieldErrors, "category") && "ring-2 ring-[var(--status-error)]/25",
          )}
          aria-invalid={fieldError(fieldErrors, "category") ? true : undefined}
        >
          {categoryOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        {fieldError(fieldErrors, "category") ? (
          <p className="mt-2 text-sm text-[var(--status-error)]" role="alert">
            {fieldError(fieldErrors, "category")}
          </p>
        ) : null}
      </div>

      <Input
        label={ui.contact.subjectLabel}
        name="subject"
        required
        value={form.subject}
        onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
        placeholder={ui.contact.subjectPlaceholder}
        error={fieldError(fieldErrors, "subject")}
      />

      <Textarea
        label={ui.contact.messageLabel}
        name="message"
        required
        value={form.message}
        onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))}
        placeholder={ui.contact.messagePlaceholder}
        error={fieldError(fieldErrors, "message")}
        rows={6}
      />

      {/* Honeypot — hidden from users and assistive tech where possible */}
      <div className="contact-honeypot" aria-hidden="true">
        <label htmlFor="contact-website">{ui.contact.honeypotLabel}</label>
        <input
          id="contact-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={form.website}
          onChange={(event) => setForm((prev) => ({ ...prev, website: event.target.value }))}
        />
      </div>

      {formError ? (
        <p className="text-sm text-[var(--status-error)]" role="alert">
          {formError}
        </p>
      ) : null}

      <Button type="submit" className="w-full sm:w-auto" isLoading={submitting} disabled={submitting}>
        {ui.contact.submit}
      </Button>
    </form>
  );
}
