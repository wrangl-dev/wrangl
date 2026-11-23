import { fireEvent, render, screen } from '@testing-library/react';
import { isWebLink } from '../lib/links';
import { Markdown } from './Markdown';

describe('Markdown', () => {
  it('renders bold, lists, inline code and tables', () => {
    const { container } = render(
      <Markdown
        text={[
          'The branch is **HEAD**.',
          '',
          '- one',
          '- two',
          '',
          'Run `git status`.',
          '',
          '| token | price |',
          '|---|---|',
          '| USDG | 1.00 |',
        ].join('\n')}
      />,
    );
    expect(container.querySelector('strong')).toHaveTextContent('HEAD');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(container.querySelector('.md-inline')).toHaveTextContent('git status');
    expect(screen.getByRole('table')).toHaveTextContent('USDG');
  });

  it('shows fenced code with its language and a copy button', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<Markdown text={'```json\n{ "chainId": 4663 }\n```'} />);
    expect(screen.getByText('json')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('{ "chainId": 4663 }');
  });

  it('never renders raw HTML or script links', () => {
    const { container } = render(
      <Markdown text={'<img src=x onerror=alert(1)> [click](javascript:alert(1))'} />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container).toHaveTextContent('click');
  });

  it('opens web links outside the page', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<Markdown text="[docs](https://wrangl-docs.pages.dev/docs/)" />);
    fireEvent.click(screen.getByRole('link', { name: 'docs' }));
    expect(open).toHaveBeenCalledWith(
      'https://wrangl-docs.pages.dev/docs/',
      '_blank',
      'noopener,noreferrer',
    );
  });
});

describe('isWebLink', () => {
  it('allows only http and https', () => {
    expect(isWebLink('https://x.dev')).toBe(true);
    expect(isWebLink('http://localhost:1420')).toBe(true);
    expect(isWebLink('javascript:alert(1)')).toBe(false);
    expect(isWebLink('file:///etc/passwd')).toBe(false);
    expect(isWebLink(undefined)).toBe(false);
  });
});
