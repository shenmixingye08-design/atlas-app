"use client";

import Link from "next/link";

import type { MihonShowcaseCompany } from "@/lib/showcase/types";
import { ui } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/design-system/cn";

type MihonCompanyCardProps = {
  company: MihonShowcaseCompany;
  index: number;
  isBusy: boolean;
  isActive: boolean;
  onAdd?: (templateId: NonNullable<MihonShowcaseCompany["templateId"]>) => void;
};

export function MihonCompanyCard({
  company,
  index,
  isBusy,
  isActive,
  onAdd,
}: MihonCompanyCardProps) {
  const isOriginal = company.kind === "original";

  return (
    <article
      className={cn(
        "group flex h-full flex-col rounded-[var(--radius-2xl)] bg-white p-8 shadow-[var(--shadow-md)] transition-all duration-[var(--motion-base)] animate-status-in sm:p-10",
        !isOriginal && "atlas-lift-3 hover:shadow-[var(--shadow-lg)]",
        isOriginal && "bg-[var(--background-subtle)] shadow-[var(--shadow-sm)]",
      )}
      style={{ animationDelay: `${Math.min(index * 55, 330)}ms` }}
    >
      <span className="text-[2.75rem] leading-none" aria-hidden="true">
        {company.icon}
      </span>

      {company.recommendation && (
        <p className="mt-6 text-caption">{company.recommendation}</p>
      )}

      <h2
        className={cn(
          "text-title text-foreground",
          company.recommendation ? "mt-1" : "mt-6",
        )}
      >
        {company.name}
      </h2>

      <p className="mt-4 text-body leading-relaxed">{company.description}</p>

      {!isOriginal && company.capabilities.length > 0 && (
        <div className="mt-10 flex-1">
          <p className="text-overline">{ui.mihon.capabilities}</p>
          <ul className="mt-4 space-y-2.5">
            {company.capabilities.map((item) => (
              <li key={item} className="text-sm text-foreground">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {isOriginal && <div className="flex-1" aria-hidden="true" />}

      <div className="mt-12">
        {isOriginal ? (
          <Link href="/company" className="block">
            <Button variant="primary" size="md" className="w-full">
              {ui.mihon.createCompany}
            </Button>
          </Link>
        ) : (
          <Button
            variant={isActive ? "secondary" : "primary"}
            size="md"
            className="w-full"
            disabled={isBusy || isActive}
            isLoading={isBusy}
            onClick={() => {
              if (company.templateId && onAdd) {
                onAdd(company.templateId);
              }
            }}
          >
            {isActive ? ui.mihon.added : ui.mihon.addCompany}
          </Button>
        )}
      </div>
    </article>
  );
}
