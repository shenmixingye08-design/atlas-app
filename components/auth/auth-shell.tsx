import Link from "next/link";

import { AtlasBackground } from "@/components/atlas-background";
import { LegalFooterLinks } from "@/components/legal/legal-footer-links";

type AuthShellProps = {
  children: React.ReactNode;
  title: string;
  subtitle: string;
};

export function AuthShell({ children, title, subtitle }: AuthShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white">
      <AtlasBackground />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col px-4 py-6 sm:px-8 sm:py-8">
        <Link
          href="/"
          className="mb-8 flex items-center gap-2.5 transition-opacity hover:opacity-80"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-500/30">
            <span className="text-sm font-bold text-white">A</span>
          </div>
          <span className="text-base font-semibold tracking-tight">Atlas</span>
        </Link>

        <div className="flex flex-1 flex-col justify-center">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              {title}
            </h1>
            <p className="mt-2 text-sm text-zinc-500">{subtitle}</p>
          </div>
          <div className="glass-strong w-full rounded-2xl p-4 sm:p-6">{children}</div>
          <LegalFooterLinks
            variant="dark"
            className="mt-6 justify-center text-center"
          />
        </div>
      </div>
    </div>
  );
}
