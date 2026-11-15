// Public GitHub data for the changelog page. Keyless: the browser calls the
// GitHub REST API directly (60 requests an hour per visitor IP), nothing is stored.

const API = 'https://api.github.com/repos/wrangl-dev/wrangl';

export type Release = {
  tag_name: string;
  html_url: string;
  published_at: string | null;
  draft: boolean;
};
export type Commit = {
  sha: string;
  html_url: string;
  commit: { message: string; committer: { date: string } | null };
};

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { accept: 'application/vnd.github+json' },
    signal,
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  return (await res.json()) as T;
}

export const fetchReleases = (signal?: AbortSignal) =>
  getJson<Release[]>('/releases?per_page=100', signal);
export const fetchCommits = (signal?: AbortSignal) =>
  getJson<Commit[]>('/commits?sha=main&per_page=100', signal);

// ---------- releases ----------

/** App releases only (tags like v0.1.1). Other tags, e.g. corral-v0.6.0, are bundled dependencies. */
export function appReleases(releases: Release[]): Release[] {
  return releases.filter((r) => !r.draft && r.published_at && /^v\d/.test(r.tag_name));
}

// ---------- commits ----------

export type ChangeKind = 'feat' | 'fix' | 'docs' | 'perf';
export type Change = {
  kind: ChangeKind;
  scope: string;
  text: string;
  sha: string;
  url: string;
  day: string; // YYYY-MM-DD, UTC
};

function isShownKind(type: string): type is ChangeKind {
  return type === 'feat' || type === 'fix' || type === 'docs' || type === 'perf';
}

/**
 * Turns a conventional commit subject into a changelog line. Housekeeping types
 * (chore, ci, build, test, style, refactor) and non-conventional subjects return null.
 */
export function parseCommit(c: Commit): Change | null {
  const subject = c.commit.message.split('\n')[0] ?? '';
  const m = /^(\w+)(?:\(([^)]+)\))?!?:\s*(.+)$/.exec(subject);
  const date = c.commit.committer?.date;
  if (!m || !date || !isShownKind(m[1])) return null;
  const text = m[3].trim();
  return {
    kind: m[1],
    scope: m[2] ?? '',
    text: text.charAt(0).toUpperCase() + text.slice(1),
    sha: c.sha.slice(0, 7),
    url: c.html_url,
    day: date.slice(0, 10),
  };
}

export type ChangelogDay = { day: string; releases: Release[]; changes: Change[] };

/** Changes and releases grouped by UTC day, newest day first. */
export function changelogDays(commits: Commit[], releases: Release[]): ChangelogDay[] {
  const days = new Map<string, ChangelogDay>();
  const dayOf = (d: string) => {
    let entry = days.get(d);
    if (!entry) {
      entry = { day: d, releases: [], changes: [] };
      days.set(d, entry);
    }
    return entry;
  };
  for (const c of commits) {
    const ch = parseCommit(c);
    if (ch) dayOf(ch.day).changes.push(ch);
  }
  for (const r of appReleases(releases)) dayOf(r.published_at!.slice(0, 10)).releases.push(r);
  return [...days.values()].sort((a, b) => (a.day < b.day ? 1 : -1));
}

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "2026-11-15" -> "15 Nov 2026". */
export function formatDay(day: string): string {
  return dayFormat.format(Date.parse(`${day}T00:00:00Z`));
}

