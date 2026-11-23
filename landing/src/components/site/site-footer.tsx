import { CHANGELOG_URL, GITHUB_REPO_URL, REPORT_BUG_URL, X_URL } from '../../lib/links';

export function SiteFooter() {
  return (
    <footer>
      <div className="wrap">
        <span>
          © 2026 Wrangl · MIT · <a href={GITHUB_REPO_URL}>GitHub</a> · <a href={X_URL}>X</a> ·{' '}
          <a href={CHANGELOG_URL}>Changelog</a> · <a href={REPORT_BUG_URL}>Report a bug</a> ·{' '}
          <a href="/privacy/">Privacy</a> · <a href="/terms/">Terms</a>
        </span>
        <span>Not financial advice. Agents can be wrong; read your wallet before you confirm.</span>
      </div>
    </footer>
  );
}
