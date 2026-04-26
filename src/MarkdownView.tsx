'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MarkdownView({ source }: { source: string }) {
  if (!source.trim()) {
    return (
      <div className="h-empty">
        <span className="h-empty-icon">—</span>
        <span>empty — no validator runs yet</span>
      </div>
    );
  }
  return (
    <div className="h-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  );
}
