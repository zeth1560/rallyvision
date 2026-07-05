import Image from 'next/image';
import Link from 'next/link';
import logoImage from '../../ReplayTrove.png';
import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_LAST_UPDATED,
  LEGAL_SITE_NAME,
} from '@/lib/legal-site';
import type { ReactNode } from 'react';

type LegalPageLayoutProps = {
  title: string;
  children: ReactNode;
};

export default function LegalPageLayout({ title, children }: LegalPageLayoutProps) {
  return (
    <main className="min-h-screen bg-white text-slate-950 font-sans">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-12 sm:px-10">
        <header className="flex flex-col items-center gap-6 border-b border-slate-200 pb-8">
          <Link href="/" className="flex items-center justify-center">
            <Image
              src={logoImage}
              alt={`${LEGAL_SITE_NAME} logo`}
              className="h-20 w-auto object-contain sm:h-24"
              priority
            />
          </Link>
          <div className="text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              {title}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Last updated: {LEGAL_LAST_UPDATED}
            </p>
          </div>
        </header>

        <article className="legal-prose flex flex-col gap-8 text-base leading-8 text-slate-700">
          {children}
        </article>

        <footer className="flex flex-col gap-4 border-t border-slate-200 pt-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Questions?{' '}
            <a
              href={`mailto:${LEGAL_CONTACT_EMAIL}`}
              className="font-medium text-slate-950 underline-offset-2 hover:underline"
            >
              {LEGAL_CONTACT_EMAIL}
            </a>
          </p>
          <nav className="flex flex-wrap gap-4">
            <Link href="/" className="hover:text-slate-950">
              Home
            </Link>
            <Link href="/privacy" className="hover:text-slate-950">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-slate-950">
              Terms of Service
            </Link>
          </nav>
        </footer>
      </div>
    </main>
  );
}
