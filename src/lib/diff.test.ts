import { countChanges, diffLines, diffsIn, hunks } from './diff';

const kinds = (lines: { kind: string; text: string }[]) =>
  lines.map((l) => `${{ same: ' ', add: '+', del: '-', gap: '~' }[l.kind]}${l.text}`);

describe('diff', () => {
  it('marks changed lines and keeps line numbers', () => {
    const lines = diffLines('a\nb\nc\nd', 'a\nB\nc\nd\ne');
    expect(kinds(lines)).toEqual([' a', '-b', '+B', ' c', ' d', '+e']);
    expect(lines[2]).toMatchObject({ oldNo: null, newNo: 2 });
    expect(lines[5]).toMatchObject({ oldNo: null, newNo: 5 });
    expect(countChanges(lines)).toEqual({ added: 2, removed: 1 });
  });

  it('a final newline is not an extra line', () => {
    expect(kinds(diffLines('# t\n', '# t\n\nmore\n'))).toEqual([' # t', '+', '+more']);
  });

  it('a new file is all additions', () => {
    expect(kinds(diffLines(null, 'x\ny'))).toEqual(['+x', '+y']);
  });

  it('folds long unchanged stretches into gaps', () => {
    const old = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
    const next = old.replace('line 10', 'LINE 10');
    expect(kinds(hunks(diffLines(old, next), 1))).toEqual([
      '~9 unchanged lines',
      ' line 9',
      '-line 10',
      '+LINE 10',
      ' line 11',
      '~8 unchanged lines',
    ]);
  });

  it('reads diffs from a tool call and ignores other content', () => {
    expect(
      diffsIn([
        { type: 'content', content: { type: 'text', text: 'hi' } },
        { type: 'diff', path: '/p/a.ts', oldText: 'x', newText: 'y' },
        { type: 'diff', path: '/p/new.ts', newText: 'z' },
      ]),
    ).toEqual([
      { path: '/p/a.ts', oldText: 'x', newText: 'y' },
      { path: '/p/new.ts', oldText: null, newText: 'z' },
    ]);
    expect(diffsIn(undefined)).toEqual([]);
  });
});
