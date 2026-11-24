import { activeMention, insertMention, mentionedFiles } from './mentions';

describe('mentions', () => {
  it('finds the @word before the caret, not an email or a finished word', () => {
    expect(activeMention('look at @src/Ap', 15)).toEqual({ start: 8, query: 'src/Ap' });
    expect(activeMention('@', 1)).toEqual({ start: 0, query: '' });
    expect(activeMention('mail me@example.com', 19)).toBeNull();
    expect(activeMention('@done then more', 15)).toBeNull();
    expect(activeMention('two @a and @b', 6)).toEqual({ start: 4, query: 'a' });
  });

  it('inserts the picked path with a space after it', () => {
    const text = 'check @ap please';
    const mention = activeMention(text, 9);
    expect(mention).not.toBeNull();
    if (!mention) return;
    expect(insertMention(text, mention, 'src/App.tsx')).toEqual({
      text: 'check @src/App.tsx please',
      caret: 19,
    });
  });

  it('sends only the picked files still in the text', () => {
    const picked = ['src/App.tsx', 'README.md', 'src/App.tsx', 'gone.ts'];
    const text = 'compare @src/App.tsx with @README.md, then @src/App.tsx.bak';
    expect(mentionedFiles(text, picked)).toEqual(['src/App.tsx']);
    expect(mentionedFiles('see @README.md', picked)).toEqual(['README.md']);
    expect(mentionedFiles('nothing here', picked)).toEqual([]);
  });
});
