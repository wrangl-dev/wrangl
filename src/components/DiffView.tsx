import { useMemo } from 'react';
import { countChanges, diffLines, type FileDiff, hunks } from '../lib/diff';

/** The part of `path` under the project, when it is inside it. */
function shortPath(path: string, root?: string): string {
  const p = path.replace(/\\/g, '/');
  const r = root?.replace(/\\/g, '/').replace(/\/$/, '');
  return r && p.toLowerCase().startsWith(`${r.toLowerCase()}/`) ? p.slice(r.length + 1) : p;
}

function OneFile({ diff, root, open }: { diff: FileDiff; root?: string; open: boolean }) {
  const lines = useMemo(() => diffLines(diff.oldText, diff.newText), [diff]);
  const shown = useMemo(() => hunks(lines), [lines]);
  const { added, removed } = countChanges(lines);
  return (
    <details className="diff" open={open}>
      <summary>
        <span className="diff-path">{shortPath(diff.path, root)}</span>
        {diff.oldText === null && <span className="diff-new">new</span>}
        <span className="diff-add">+{added}</span>
        <span className="diff-del">−{removed}</span>
      </summary>
      <table className="diff-lines">
        <tbody>
          {shown.map((l, i) => (
            // Lines have no id of their own; their order never changes.
            <tr key={i} data-kind={l.kind}>
              <td className="diff-no">{l.oldNo ?? ''}</td>
              <td className="diff-no">{l.newNo ?? ''}</td>
              <td className="diff-sign">
                {l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : l.kind === 'gap' ? '⋯' : ' '}
              </td>
              <td className="diff-text">{l.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** File changes from an agent's tool call, one collapsible block per file. */
export function DiffView({
  diffs,
  root,
  open = false,
}: {
  diffs: FileDiff[];
  root?: string;
  open?: boolean;
}) {
  return (
    <div className="diffs" aria-label="File changes">
      {diffs.map((d) => (
        <OneFile key={d.path} diff={d} root={root} open={open} />
      ))}
    </div>
  );
}
