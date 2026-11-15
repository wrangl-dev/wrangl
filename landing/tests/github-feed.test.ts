import { describe, expect, test } from 'bun:test';

import {
  appReleases,
  changelogDays,
  formatDay,
  parseCommit,
  type Commit,
  type Release,
} from '../src/lib/github-feed';

const commit = (message: string, date = '2026-11-15T07:00:00Z', sha = 'eb0ff34aaaaaaa'): Commit => ({
  sha,
  html_url: `https://github.com/wrangl-dev/wrangl/commit/${sha}`,
  commit: { message, committer: { date } },
});

const release = (tag: string, published: string | null, draft = false): Release => ({
  tag_name: tag,
  html_url: `https://github.com/wrangl-dev/wrangl/releases/tag/${tag}`,
  published_at: published,
  draft,
});

describe('parseCommit', () => {
  test('reads type, scope and capitalizes the subject', () => {
    expect(parseCommit(commit('fix(landing): keep the hero layers intact on phones\n\nbody'))).toEqual({
      kind: 'fix',
      scope: 'landing',
      text: 'Keep the hero layers intact on phones',
      sha: 'eb0ff34',
      url: 'https://github.com/wrangl-dev/wrangl/commit/eb0ff34aaaaaaa',
      day: '2026-11-15',
    });
  });

  test('works without a scope and with a breaking-change bang', () => {
    expect(parseCommit(commit('feat: initial release of wrangl'))?.scope).toBe('');
    expect(parseCommit(commit('feat(api)!: drop v1'))?.kind).toBe('feat');
  });

  test('hides housekeeping and non-conventional commits', () => {
    expect(parseCommit(commit('chore(release): bump version to 0.1.1'))).toBeNull();
    expect(parseCommit(commit('ci(deploy): skip deploy'))).toBeNull();
    expect(parseCommit(commit('Merge branch main'))).toBeNull();
  });
});

describe('releases', () => {
  const releases = [
    release('v0.1.1', '2026-11-15T06:08:21Z'),
    release('corral-v0.6.0', '2026-11-14T16:39:46Z'),
    release('v0.2.0', null, true),
  ];

  test('keeps only published app releases', () => {
    expect(appReleases(releases).map((r) => r.tag_name)).toEqual(['v0.1.1']);
  });

  test('groups changes and releases by day, newest first', () => {
    const days = changelogDays(
      [
        commit('fix(landing): b', '2026-11-15T07:00:00Z', 'bbbbbbb1'),
        commit('chore: noise', '2026-11-15T06:00:00Z', 'ccccccc1'),
        commit('feat(chain): a', '2026-11-14T10:00:00Z', 'aaaaaaa1'),
      ],
      releases,
    );
    expect(days.map((d) => d.day)).toEqual(['2026-11-15', '2026-11-14']);
    expect(days[0].releases.map((r) => r.tag_name)).toEqual(['v0.1.1']);
    expect(days[0].changes.map((c) => c.text)).toEqual(['B']);
    expect(days[1].changes.map((c) => c.kind)).toEqual(['feat']);
  });
});

describe('dates', () => {
  test('formats a day', () => {
    expect(formatDay('2026-11-05')).toBe('5 Nov 2026');
  });
});
