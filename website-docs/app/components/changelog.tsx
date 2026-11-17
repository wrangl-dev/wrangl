import {
  type ChangeKind,
  type ChangelogDay,
  changelogDays,
  fetchCommits,
  fetchReleases,
  formatDay
} from '@/lib/github-feed'
import { gitConfig } from '@/lib/shared'
import { useGithubData } from '@/lib/use-github-data'

const kindLabel: Record<ChangeKind, string> = {
  feat: 'New',
  fix: 'Fix',
  docs: 'Docs',
  perf: 'Faster'
}

const commitsUrl = `https://github.com/${gitConfig.user}/${gitConfig.repo}/commits/${gitConfig.branch}`

const loadChangelog = (signal: AbortSignal): Promise<ChangelogDay[]> =>
  Promise.all([fetchCommits(signal), fetchReleases(signal)]).then(([commits, releases]) =>
    changelogDays(commits, releases)
  )

/** Changes on main grouped by day, read live from GitHub when the page opens. */
export function Changelog() {
  const state = useGithubData(loadChangelog)

  if (state.status === 'loading') {
    return <p className="text-fd-muted-foreground">Loading changes from GitHub…</p>
  }
  if (state.status === 'error') {
    return (
      <p className="text-fd-muted-foreground">
        GitHub did not answer. It allows 60 requests an hour per visitor, so try again later, or
        read the <a href={commitsUrl}>commit history</a> on GitHub.
      </p>
    )
  }

  return (
    <div className="not-prose flex flex-col">
      {state.data.map((d) => (
        <section
          key={d.day}
          aria-labelledby={`day-${d.day}`}
          className="grid gap-3 border-b border-fd-border py-6 md:grid-cols-[150px_minmax(0,1fr)] md:gap-6"
        >
          <h2
            id={`day-${d.day}`}
            className="m-0 font-mono text-sm font-medium text-fd-muted-foreground"
          >
            <time dateTime={d.day}>{formatDay(d.day)}</time>
          </h2>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {d.releases.map((r) => (
              <li key={r.tag_name} className="grid grid-cols-[56px_minmax(0,1fr)] gap-3">
                <span className="font-mono text-xs leading-6 text-fd-primary">Release</span>
                <a href={r.html_url} className="font-semibold underline underline-offset-4">
                  {r.tag_name} is out
                </a>
              </li>
            ))}
            {d.changes.map((c) => (
              <li
                key={c.sha}
                className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-baseline gap-3"
              >
                <span
                  className={`font-mono text-xs ${c.kind === 'feat' ? 'text-fd-primary' : 'text-fd-muted-foreground'}`}
                >
                  {kindLabel[c.kind]}
                </span>
                <span className="break-words">
                  {c.text}
                  {c.scope && (
                    <span className="font-mono text-xs text-fd-muted-foreground"> · {c.scope}</span>
                  )}
                </span>
                <a
                  href={c.url}
                  aria-label={`Commit ${c.sha} on GitHub`}
                  className="hidden font-mono text-xs text-fd-muted-foreground hover:text-fd-foreground sm:inline"
                >
                  {c.sha}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
