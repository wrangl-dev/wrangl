/** One file change an agent reports in a tool call (ACP `{"type": "diff"}` content). */
export interface FileDiff {
  path: string;
  /** Missing for a new file. */
  oldText: string | null;
  newText: string;
}

export type DiffLine =
  | { kind: 'same' | 'add' | 'del'; text: string; oldNo: number | null; newNo: number | null }
  | { kind: 'gap'; text: string; oldNo: null; newNo: null };

/** Above this many line pairs, skip the exact diff and show the files as fully replaced. */
const MAX_CELLS = 4_000_000;

/** Lines of `text`; a final newline ends the last line rather than starting an empty one. */
const splitLines = (text: string | null) =>
  text ? text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n') : [];

/** Line diff of `oldText` → `newText` (longest common subsequence). */
export function diffLines(oldText: string | null, newText: string): DiffLine[] {
  const a = splitLines(oldText);
  const b = splitLines(newText);
  // Common head and tail first: most edits touch a few lines of a long file.
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  )
    tail++;
  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);

  const out: DiffLine[] = [];
  let oldNo = 1;
  let newNo = 1;
  const same = (text: string) => out.push({ kind: 'same', text, oldNo: oldNo++, newNo: newNo++ });
  const del = (text: string) => out.push({ kind: 'del', text, oldNo: oldNo++, newNo: null });
  const add = (text: string) => out.push({ kind: 'add', text, oldNo: null, newNo: newNo++ });

  for (let i = 0; i < head; i++) same(a[i]);
  if (midA.length * midB.length > MAX_CELLS) {
    midA.forEach(del);
    midB.forEach(add);
  } else {
    // lcs[i][j]: length of the common subsequence of midA[i..] and midB[j..].
    const n = midA.length;
    const m = midB.length;
    const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i][j] =
          midA[i] === midB[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        same(midA[i++]);
        j++;
      } else if (lcs[i + 1][j] >= lcs[i][j + 1]) del(midA[i++]);
      else add(midB[j++]);
    }
    while (i < n) del(midA[i++]);
    while (j < m) add(midB[j++]);
  }
  for (let i = a.length - tail; i < a.length; i++) same(a[i]);
  return out;
}

/** Keep the changed lines and `context` unchanged lines around them; the rest becomes gaps. */
export function hunks(lines: DiffLine[], context = 3): DiffLine[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((l, i) => {
    if (l.kind === 'add' || l.kind === 'del') {
      for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) {
        keep[k] = true;
      }
    }
  });
  const out: DiffLine[] = [];
  let skipped = 0;
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (skipped)
        out.push({ kind: 'gap', text: `${skipped} unchanged lines`, oldNo: null, newNo: null });
      skipped = 0;
      out.push(l);
    } else skipped++;
  });
  if (skipped && out.length) {
    out.push({ kind: 'gap', text: `${skipped} unchanged lines`, oldNo: null, newNo: null });
  }
  return out;
}

export function countChanges(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const l of lines) {
    if (l.kind === 'add') added++;
    else if (l.kind === 'del') removed++;
  }
  return { added, removed };
}

/** The diffs in an ACP tool call's `content`, if any. */
export function diffsIn(content: unknown): FileDiff[] {
  if (!Array.isArray(content)) return [];
  return content.flatMap((c) =>
    c && typeof c === 'object' && c.type === 'diff' && typeof c.path === 'string'
      ? [
          {
            path: c.path,
            oldText: typeof c.oldText === 'string' ? c.oldText : null,
            newText: typeof c.newText === 'string' ? c.newText : '',
          },
        ]
      : [],
  );
}
