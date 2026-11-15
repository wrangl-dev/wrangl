import {
  changelogDays,
  fetchCommits,
  fetchReleases,
  formatDay,
  type ChangeKind,
  type ChangelogDay,
} from '../lib/github-feed';
import { GITHUB_REPO_URL } from '../lib/links';
import { usePageMeta } from '../lib/page-meta';
import { useGithubData } from '../lib/use-github-data';

const kindLabel: Record<ChangeKind, string> = {
  feat: 'New',
  fix: 'Fix',
  docs: 'Docs',
  perf: 'Faster',
};

const loadChangelog = (signal: AbortSignal): Promise<ChangelogDay[]> =>
  Promise.all([fetchCommits(signal), fetchReleases(signal)]).then(([commits, releases]) =>
    changelogDays(commits, releases),
  );

export function ChangelogPage() {
  usePageMeta({
    title: 'Changelog — Wrangl',
    description:
      'Every feature, fix and docs change that lands in Wrangl, by day, read live from GitHub. Releases are marked on the day they shipped.',
    path: '/changelog/',
  });
  const state = useGithubData(loadChangelog);

  return (
    <div className="page-log">
      <main>
        <section className="page-head" aria-labelledby="page-title">
          <div className="wrap">
            <p className="eyebrow">Changelog</p>
            <h1 id="page-title">What changed, day by day.</h1>
            <p className="sub">
              Every feature, fix and docs change that lands on main, read live from GitHub when you
              open this page. Releases are marked on the day they shipped.
            </p>
            <p className="head-links">
              <a href={`${GITHUB_REPO_URL}/releases`}>All releases on GitHub ↗</a>
            </p>
          </div>
        </section>

        <section className="log" aria-label="Changes" aria-busy={state.status === 'loading'}>
          <div className="wrap">
            {state.status === 'loading' && <p className="note">Loading changes from GitHub…</p>}
            {state.status === 'error' && (
              <p className="note">
                GitHub did not answer. It allows 60 requests an hour per visitor, so try again later,
                or read the <a href={`${GITHUB_REPO_URL}/commits/main`}>commit history</a> on GitHub.
              </p>
            )}
            {state.status === 'ready' &&
              state.data.map((d) => (
                <article className="day" key={d.day} aria-labelledby={`day-${d.day}`}>
                  <h2 id={`day-${d.day}`}>
                    <time dateTime={d.day}>{formatDay(d.day)}</time>
                  </h2>
                  <ul>
                    {d.releases.map((r) => (
                      <li className="rel" key={r.tag_name}>
                        <span className="kind">Release</span>
                        <a href={r.html_url}>{r.tag_name} is out</a>
                      </li>
                    ))}
                    {d.changes.map((c) => (
                      <li key={c.sha}>
                        <span className={`kind k-${c.kind}`}>{kindLabel[c.kind]}</span>
                        <span className="text">
                          {c.text}
                          {c.scope && <span className="scope"> · {c.scope}</span>}
                        </span>
                        <a className="sha" href={c.url} aria-label={`Commit ${c.sha} on GitHub`}>
                          {c.sha}
                        </a>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
          </div>
        </section>
      </main>
    </div>
  );
}
