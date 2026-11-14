import { FooterColumn, FooterLink, type FooterLink as FooterLinkData } from './FooterLinks';
import { Logo } from "../ui/Logo";
import { ProductCta } from '../ui/ProductCta';
import { Mark } from '../ui/Mark';
import { Reveal } from '../ui/Reveal';
import {
  CONTRIBUTING_URL,
  DOCS_URL,
  GITHUB_REPO_URL,
  ISSUES_URL,
  LATEST_RELEASE_URL,
  LICENSE_URL,
  PULLS_URL,
} from "../../lib/links";

const footerColumns: { title: string; links: FooterLinkData[] }[] = [
  {
    title: 'downloads',
    links: [
      { label: 'Windows (x64)', href: LATEST_RELEASE_URL },
      { label: 'macOS (Apple Silicon)', href: LATEST_RELEASE_URL },
      { label: 'macOS (Intel)', href: LATEST_RELEASE_URL },
      { label: 'Linux (x64)', href: LATEST_RELEASE_URL },
    ],
  },
  {
    title: 'resources',
    links: [
      { label: 'Documentation', href: DOCS_URL },
      { label: 'Report an Issue', href: ISSUES_URL },
      { label: 'Pull Requests', href: PULLS_URL },
      { label: 'Contributing', href: CONTRIBUTING_URL },
    ],
  },
  {
    title: 'project',
    links: [
      { label: 'GitHub Repository', href: GITHUB_REPO_URL },
      { label: 'License (MIT)', href: LICENSE_URL },
      { label: 'Built with Tauri', href: 'https://tauri.app' },
    ],
  },
];

const legalLinkClassName =
  'border-b border-transparent transition-[color,border-color] duration-150 ease-[var(--ease-out)] hover:border-white hover:text-white';

export const Footer = () => {
  return (
    <footer id="download" className="relative overflow-hidden border-t border-white/15 bg-ink px-6 pt-24 sm:pt-32">
      <div className="mx-auto max-w-7xl">
        <Reveal>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-end lg:gap-16">
            <h2 className="font-mono text-[clamp(1.875rem,6.4vw,4.25rem)] leading-[1.05] font-bold tracking-tighter text-balance text-white">
              Take control of your terminal.
            </h2>
            <ProductCta variant="footer" />
          </div>
        </Reveal>

        <div className="mt-24 grid grid-cols-2 gap-x-6 gap-y-12 border-t border-white/15 pt-12 md:grid-cols-5">
          <div className="col-span-2">
            <Logo />
            <p className="mt-6 max-w-xs text-base leading-relaxed text-gray-400">
              A modern, project-aware terminal manager built with Tauri. Organize terminals by project with persistent sessions.
            </p>
          </div>

          {footerColumns.map((column) => (
            <FooterColumn key={column.title} {...column} />
          ))}
        </div>

        <div className="mt-16 flex flex-col justify-between gap-4 border-t border-white/15 py-8 font-mono text-sm text-gray-400 md:flex-row md:items-center">
          <p>© {new Date().getFullYear()} Wrangl Contributors. MIT Licensed.</p>
          <div className="flex items-center gap-6">
            <a href="/privacy/" className={legalLinkClassName}>Privacy</a>
            <a href="/terms/" className={legalLinkClassName}>Terms</a>
            <FooterLink href={GITHUB_REPO_URL}>GitHub</FooterLink>
          </div>
        </div>
      </div>

      {/* Oversized mark, cropped by the page edge. Decorative. */}
      <div aria-hidden="true" className="pointer-events-none -mb-[6%] select-none">
        <Mark className="mx-auto w-full max-w-7xl text-white/[0.06]" />
      </div>
    </footer>
  );
};
