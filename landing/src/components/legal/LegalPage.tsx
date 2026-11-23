import type { ReactNode } from 'react';

import { usePageMeta } from '../../lib/page-meta';

type LegalPageProps = {
  title: string;
  description: string;
  path: string;
  lastUpdated: string;
  children: ReactNode;
};

export function LegalPage({ title, description, path, lastUpdated, children }: LegalPageProps) {
  usePageMeta({
    title: `${title} — Wrangl`,
    description,
    path,
    robots: 'index,follow',
  });

  return (
    <div className="page-legal">
      <main>
        <div className="wrap">
          <article className="legal">
            <h1>{title}</h1>
            <p className="updated">Last updated: {lastUpdated}</p>
            <p className="draft">
              This page is a plain-language draft. It describes what the Wrangl website and app do
              today, as far as we could verify in the source code. It is not legal advice.
            </p>
            <div className="legal-body">{children}</div>
          </article>
        </div>
      </main>
    </div>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function LegalList({ children }: { children: ReactNode }) {
  return <ul>{children}</ul>;
}

export function LegalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}
