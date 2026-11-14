import type { ReactNode } from 'react';

export type FooterLink = {
  label: string;
  href: string;
};

type FooterColumnProps = {
  title: string;
  links: FooterLink[];
};

const footerLinkClassName =
  'border-b border-transparent transition-[color,border-color] duration-150 ease-[var(--ease-out)] hover:border-white hover:text-white';

export function FooterColumn({ title, links }: FooterColumnProps) {
  return (
    <div>
      <h4 className="mb-5 font-mono text-sm text-white">
        <span className="text-gray-500">/</span>
        {title}
      </h4>
      <ul className="flex flex-col gap-3 text-base text-gray-400">
        {links.map((link) => (
          <li key={link.label}>
            <FooterLink href={link.href}>{link.label}</FooterLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={footerLinkClassName}>
      {children}
    </a>
  );
}
