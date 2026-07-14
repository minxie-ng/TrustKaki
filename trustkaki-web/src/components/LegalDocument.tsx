import Link from "next/link";
import type { ReactNode } from "react";

export function LegalDocument({
  eyebrow,
  title,
  updated,
  introduction,
  children,
}: {
  eyebrow: string;
  title: string;
  updated: string;
  introduction: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4 sm:px-8">
          <Link className="text-base font-semibold text-zinc-950" href="/">
            TrustKaki
          </Link>
          <span className="text-sm text-zinc-500">Privacy and data care</span>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <p className="text-sm font-semibold uppercase text-emerald-700">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-bold text-zinc-950 sm:text-4xl">{title}</h1>
        <p className="mt-3 text-sm text-zinc-500">Last updated: {updated}</p>
        <p className="mt-7 text-lg leading-8 text-zinc-700">{introduction}</p>

        <div className="mt-10 space-y-10 leading-7 text-zinc-700 [&_a]:font-medium [&_a]:text-emerald-700 [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-zinc-950 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-2">
          {children}
        </div>
      </article>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap gap-x-6 gap-y-2 px-5 py-6 text-sm text-zinc-600 sm:px-8">
          <Link href="/privacy">Privacy policy</Link>
          <Link href="/data-deletion">Access and deletion</Link>
          <Link href="/">Return to TrustKaki</Link>
        </div>
      </footer>
    </main>
  );
}
