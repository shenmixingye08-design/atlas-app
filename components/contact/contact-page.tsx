import Link from "next/link";

import { ContactForm } from "@/components/contact/contact-form";
import { LegalFooterLinks } from "@/components/legal/legal-footer-links";
import { ui } from "@/lib/i18n";

export function ContactPage() {
  return (
    <div className="terms-page contact-page min-h-screen bg-[var(--terms-bg)] text-[var(--terms-heading)]">
      <header className="terms-page-header border-b border-[var(--border-subtle)] bg-[var(--terms-bg)]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <Link
            href="/"
            className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 shadow-md shadow-blue-500/20">
              <span className="text-sm font-bold text-white">A</span>
            </div>
            <span className="text-base font-semibold tracking-tight">{ui.brand}</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[720px] px-4 py-10 sm:px-8 sm:py-14">
        <div className="mb-8 space-y-3">
          <p className="text-sm font-medium text-[var(--terms-accent)]">{ui.contact.badge}</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {ui.contact.title}
          </h1>
          <p className="text-base leading-relaxed text-[var(--terms-muted)]">
            {ui.contact.intro}
          </p>
        </div>

        <div className="contact-card rounded-2xl border border-[var(--border-subtle)] bg-[var(--terms-bg)] p-5 shadow-[var(--shadow-sm)] sm:p-8">
          <ContactForm />
        </div>

        <LegalFooterLinks
          variant="light"
          className="mt-8 border-t border-[var(--border-subtle)] pt-6"
        />
      </main>
    </div>
  );
}
