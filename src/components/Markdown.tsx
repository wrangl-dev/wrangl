import { useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { isWebLink, openExternal } from '../lib/links';

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard
      ?.writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      })
      .catch(() => {});
  };
  return (
    <div className="md-code">
      <div className="md-code-bar">
        <span>{language ?? 'text'}</span>
        <button type="button" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

const components: Components = {
  a: ({ href, children }) =>
    isWebLink(href) ? (
      <a
        href={href}
        title={href}
        onClick={(e) => {
          e.preventDefault();
          openExternal(href);
        }}
      >
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const text = String(children ?? '');
    const language = /language-([\w-]+)/.exec(className ?? '')?.[1];
    // Fenced blocks carry a language class or span lines; the rest is inline code.
    if (language || text.includes('\n')) {
      return <CodeBlock code={text.replace(/\n$/, '')} language={language} />;
    }
    return <code className="md-inline">{children}</code>;
  },
  table: ({ children }) => (
    <div className="md-table">
      <table>{children}</table>
    </div>
  ),
  // Agents' images could be tracking pixels or huge; show the link instead.
  img: ({ src, alt }) =>
    typeof src === 'string' && isWebLink(src) ? (
      <a
        href={src}
        onClick={(e) => {
          e.preventDefault();
          openExternal(src);
        }}
      >
        {alt || 'image'}
      </a>
    ) : null,
};

/** An agent's answer: GitHub-flavoured Markdown, no raw HTML. */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  );
}
