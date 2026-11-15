import { useLocation } from 'react-router';

import { DOCS_URL, GITHUB_REPO_URL, LATEST_RELEASE_URL } from '../../lib/links';
import { BrandMark } from './brand-mark';

export function SiteHeader() {
  const pathname = useLocation().pathname.replace(/\/+$/, '') || '/';
  const isHome = pathname === '/';
  const onFeatures = pathname === '/features';
  const onInstall = pathname === '/install';
  const onChangelog = pathname === '/changelog';

  return (
    <header>
      <div className="wrap nav">
        <a className="brand" href={isHome ? '#' : '/'} aria-label="Wrangl home">
          <BrandMark />
          Wrangl
        </a>
        <nav className="nav-links" aria-label="Main">
          <a href="/features/" aria-current={onFeatures ? 'page' : undefined}>Features</a>
          <a href="/install/" aria-current={onInstall ? 'page' : undefined}>Install</a>
          <a href="/changelog/" aria-current={onChangelog ? 'page' : undefined}>Changelog</a>
          <a href={DOCS_URL}>Docs</a>
          <a href={GITHUB_REPO_URL}>GitHub</a>
        </nav>
        <div className="nav-cta">
          <a
            className="btn btn-primary btn-sm"
            href={onInstall ? LATEST_RELEASE_URL : '/install/'}
          >
            Download
          </a>
        </div>
      </div>
    </header>
  );
}
