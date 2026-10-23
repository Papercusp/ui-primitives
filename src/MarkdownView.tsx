'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ReactNode } from 'react';

/** The chat policy keeps source text inert and opens only safe absolute links. */
function externalUrl(value: string): string {
  try { return ['http:', 'https:', 'mailto:'].includes(new URL(value).protocol) ? value : ''; }
  catch { return ''; }
}

export function MarkdownView({ source, emptyText = 'empty — nothing to show yet', linkPolicy = 'default' }: {
  source: string; emptyText?: string; linkPolicy?: 'default' | 'external';
}) {
  if (!source.trim()) {
    return (
      <div className="h-empty">
        <span className="h-empty-icon">—</span>
        <span>{emptyText}</span>
      </div>
    );
  }
  return (
    <div className="h-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}
        {...(linkPolicy === 'external' ? {
          skipHtml: true,
          urlTransform: externalUrl,
          components: {
            a: ({ href, children }: { href?: string; children?: ReactNode }) => href
              ? <a href={href} target="_blank" rel="noreferrer noopener">{children}</a> : <span>{children}</span>,
            img: ({ alt }: { alt?: string }) => <span>{alt ? `[image: ${alt}]` : '[image]'}</span>,
          },
        } : {})}>{source}</ReactMarkdown>
    </div>
  );
}
