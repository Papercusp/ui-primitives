'use client';

import { memo, useEffect, useMemo, useRef } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import Anser from 'anser';

interface LogViewProps {
  lines: string[];
}

const TS_RE = /^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[+\-]\d{2}:?\d{2}|Z)?)\]\s*/;

type LogKind = 'error' | 'warn' | 'decision' | 'plan' | 'iteration' | 'invoke' | 'info';

function classifyLine(text: string): LogKind | undefined {
  if (/\bERROR\b|\bFATAL\b|Aborting|Traceback/i.test(text)) return 'error';
  if (/\bWARN\b|Warning/i.test(text)) return 'warn';
  if (/\bORCH decision:/i.test(text)) return 'decision';
  if (/^PLAN:/i.test(text)) return 'plan';
  if (/^── iteration\s+\d+\s+──/i.test(text)) return 'iteration';
  if (/\binvoke \w+ rc=0\b/i.test(text)) return 'invoke';
  if (/\bPLANNED:\b/i.test(text)) return 'info';
  return undefined;
}

function labelForKind(kind: LogKind | undefined): string | null {
  switch (kind) {
    case 'error': return 'error';
    case 'warn': return 'warn';
    case 'decision': return 'decision';
    case 'plan': return 'plan';
    case 'iteration': return 'iter';
    case 'invoke': return 'invoke';
    case 'info': return 'info';
    default: return null;
  }
}

const LogLine = memo(function LogLine({ index, line }: { index: number; line: string }) {
  const m = line.match(TS_RE);
  const ts = m?.[1];
  const rest = m ? line.slice(m[0].length) : line;
  const kind = classifyLine(rest);
  const label = labelForKind(kind);
  const parts = useMemo(
    () =>
      Anser.ansiToJson(rest, { use_classes: false, remove_empty: true }).map((p) => ({
        content: p.content,
        style: {
          color: p.fg ? `rgb(${p.fg})` : undefined,
          background: p.bg ? `rgb(${p.bg})` : undefined,
          fontWeight: p.decoration === 'bold' ? 600 : undefined,
          fontStyle: p.decoration === 'italic' ? 'italic' : undefined,
          textDecoration: p.decoration === 'underline' ? 'underline' : undefined,
        },
      })),
    [rest],
  );

  return (
    <div className={`h-log-line${kind ? ` ${kind} kind-${kind}` : ''}`}>
      <span className="h-log-no" aria-hidden="true">{String(index + 1).padStart(3, '0')}</span>
      {ts ? (
        <span className="h-log-ts">{ts.slice(5, 19).replace('T', ' ')}</span>
      ) : (
        <span className="h-log-ts empty" aria-hidden="true">····· ··:··:··</span>
      )}
      {label ? <span className={`h-log-tag ${kind}`}>{label}</span> : <span className="h-log-tag empty" aria-hidden="true" />}
      <span className="h-log-msg">
        {parts.map((p, i) => (
          <span key={i} style={p.style}>{p.content}</span>
        ))}
      </span>
    </div>
  );
});

export function LogView({ lines }: LogViewProps) {
  const ref = useRef<VirtuosoHandle>(null);
  const atBottomRef = useRef(true);

  useEffect(() => {
    if (atBottomRef.current && ref.current && lines.length > 0) {
      ref.current.scrollToIndex({ index: lines.length - 1, behavior: 'auto' });
    }
  }, [lines.length]);

  if (lines.length === 0) {
    return (
      <div className="h-empty">
        <span className="h-empty-icon">—</span>
        <span>waiting for log output…</span>
      </div>
    );
  }

  return (
    <Virtuoso
      ref={ref}
      data={lines}
      className="h-log"
      style={{ height: '100%' }}
      atBottomStateChange={(atBottom) => { atBottomRef.current = atBottom; }}
      followOutput="smooth"
      itemContent={(i, line) => <LogLine index={i} line={line} />}
    />
  );
}
