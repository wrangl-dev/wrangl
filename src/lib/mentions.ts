import { call } from './ipc';

/** An `@` being typed: where it starts in the text and what follows it so far. */
export interface Mention {
  start: number;
  query: string;
}

/** The `@word` right before the caret, if the caret is in one. An `@` inside a word (an email) is not one. */
export function activeMention(text: string, caret: number): Mention | null {
  const before = text.slice(0, caret);
  const match = /(^|\s)@([^\s@]*)$/.exec(before);
  if (!match) return null;
  return { start: before.length - match[2].length - 1, query: match[2] };
}

/** Replace the typed `@query` with `@path ` and put the caret after it. */
export function insertMention(
  text: string,
  mention: Mention,
  path: string,
): { text: string; caret: number } {
  const end = mention.start + 1 + mention.query.length;
  const inserted = `@${path} `;
  return {
    text: text.slice(0, mention.start) + inserted + text.slice(end).replace(/^ /, ''),
    caret: mention.start + inserted.length,
  };
}

/** The picked files still mentioned in the text, in the order they were picked, once each. */
export function mentionedFiles(text: string, picked: string[]): string[] {
  return [...new Set(picked)].filter((path) => {
    const at = `@${path}`;
    let from = 0;
    for (;;) {
      const i = text.indexOf(at, from);
      if (i < 0) return false;
      const before = i === 0 ? ' ' : text[i - 1];
      const after = text[i + at.length] ?? ' ';
      if (/\s/.test(before) && /\s/.test(after)) return true;
      from = i + 1;
    }
  });
}

/** Project files matching `query`, best first (see `src-tauri/src/files.rs`). */
export const searchFiles = (cwd: string, query: string) =>
  call<string[]>('files_search', { cwd, query });
