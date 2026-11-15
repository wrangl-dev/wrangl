import { usePageMeta } from '../lib/page-meta';

export function NotFoundPage() {
  usePageMeta({
    title: 'Page not found — Wrangl',
    description: 'The page you are looking for does not exist.',
    robots: 'noindex,nofollow',
  });

  return (
    <div className="page-legal">
      <main>
        <div className="wrap">
          <div className="not-found">
            <p className="code">404</p>
            <h1>Page not found</h1>
            <p>The page you are looking for does not exist or has moved.</p>
            <a className="btn btn-primary" href="/">Back to home</a>
          </div>
        </div>
      </main>
    </div>
  );
}
