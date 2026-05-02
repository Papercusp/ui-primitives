'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import Anser from 'anser';

/**
 * Mirror of the structured log-event shape produced by the harness's
 * run.log.jsonl writer (libs/papercusp/packages/harness/run.sh) and the
 * operator's plugin host (apps/operator/lib/log-events.ts). Inlined here
 * to keep ui-primitives free of operator imports.
 */
export interface LogEvent {
  ts: string;
  source: string; // 'harness' | 'plugin:<slug>' | 'claude' | 'browser' | …
  level: 'debug' | 'info' | 'warn' | 'error' | 'decision' | 'iteration' | 'plan';
  msg: string;
  corrId?: string;
  attrs?: Record<string, unknown>;
}

export interface LogTab {
  /** Stable id used as the active-tab key. */
  id: string;
  /** Visible label. */
  label: string;
  /** Predicate over events. */
  filter: (e: LogEvent) => boolean;
  /** Optional count badge override (default: filtered.length). */
  count?: number;
}

export interface LogViewProps {
  events: LogEvent[];
  /** Override the tab strip; otherwise tabs are auto-derived from sources. */
  tabs?: LogTab[];
  /** Currently active tab id. Defaults to 'all'. */
  activeTabId?: string;
  onTabChange?: (id: string) => void;
}

function labelForLevel(level: LogEvent['level']): string {
  switch (level) {
    case 'iteration': return 'iter';
    case 'decision':  return 'decision';
    case 'plan':      return 'plan';
    case 'error':     return 'error';
    case 'warn':      return 'warn';
    case 'info':      return 'info';
    case 'debug':     return 'debug';
  }
}

function classNameForLevel(level: LogEvent['level']): string {
  return `kind-${level}`;
}

/** Format ISO ts as 'MM-DD HH:MM:SS' for the gutter. */
function formatTs(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return iso.slice(0, 14);
  return `${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`;
}

/** Strip the source prefix off a plugin slug — '@papercupai/foo' → 'foo'. */
function shortPluginName(source: string): string {
  if (!source.startsWith('plugin:')) return source;
  const slug = source.slice('plugin:'.length);
  const idx = slug.lastIndexOf('/');
  return idx >= 0 ? slug.slice(idx + 1) : slug;
}

/**
 * Patterns the linkifier recognizes inside log message content. Order
 * matters — first match wins per chunk so we don't double-wrap (e.g.
 * a URL that contains an absolute file path inside its query string).
 */
const URL_RE = /https?:\/\/[^\s<>"']+/g;
// Absolute file paths: /a/b/c or C:\a\b\c — followed by an optional :line:col
const PATH_RE = /\b([\/A-Z]:?[\w./\\-]+\.\w+)(?::(\d+)(?::(\d+))?)?\b/g;
// Harness feature/issue ids the operator surfaces (feature_xxx, issue_xxx, snap_xxx)
const ID_RE = /\b((?:feature|issue|snap|inv)[_-][a-z0-9_-]+)\b/g;

interface Segment {
  content: string;
  style?: React.CSSProperties;
  href?: string;
  /** When set, click target is local — UI handler dispatches a CustomEvent. */
  appLink?: { kind: 'feature' | 'issue' | 'snapshot' | 'invocation'; id: string };
}

/**
 * Take Anser-tokenized parts (color/style chunks) and run each chunk's text
 * through the linkifier patterns, producing finer-grained Segment[]. Style
 * is preserved across the splits so a colored URL stays colored.
 */
function linkifyParts(
  parts: Array<{ content: string; style: React.CSSProperties }>,
): Segment[] {
  const out: Segment[] = [];
  for (const part of parts) {
    if (!part.content) continue;
    const text = part.content;
    // Walk through the text, prioritizing URL matches, then paths, then ids.
    // Combined regex with alternation would be tidier but obscures the
    // priority logic — keep separate passes.
    const matches: Array<{ start: number; end: number; seg: Segment }> = [];
    for (const m of text.matchAll(URL_RE)) {
      const start = m.index ?? 0;
      matches.push({
        start,
        end: start + m[0].length,
        seg: { content: m[0], style: part.style, href: m[0] },
      });
    }
    // Skip path/id matches that overlap a URL.
    const overlaps = (s: number, e: number): boolean =>
      matches.some((mm) => !(e <= mm.start || s >= mm.end));
    for (const m of text.matchAll(PATH_RE)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      // Treat as a path only if the file extension looks plausible AND the
      // string contains a path separator. Otherwise it's a normal word.
      if (!/[\/\\]/.test(m[0])) continue;
      // Open-in-editor URL — code-server / vscode protocol.
      const href = `vscode://file${m[0]}`;
      matches.push({ start, end, seg: { content: m[0], style: part.style, href } });
    }
    for (const m of text.matchAll(ID_RE)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      const id = m[0];
      const kind = id.startsWith('feature') ? 'feature'
        : id.startsWith('issue') ? 'issue'
        : id.startsWith('snap') ? 'snapshot'
        : 'invocation';
      matches.push({
        start, end,
        seg: { content: id, style: part.style, appLink: { kind, id } },
      });
    }
    matches.sort((a, b) => a.start - b.start);

    // Stitch unmatched plain-text gaps in between.
    let cursor = 0;
    for (const m of matches) {
      if (m.start < cursor) continue; // overlapping — keep first
      if (m.start > cursor) {
        out.push({ content: text.slice(cursor, m.start), style: part.style });
      }
      out.push(m.seg);
      cursor = m.end;
    }
    if (cursor < text.length) {
      out.push({ content: text.slice(cursor), style: part.style });
    }
  }
  return out;
}

/**
 * Click handler for in-app id links. Dispatches a CustomEvent the harness
 * dashboard (or whatever shell is hosting LogView) can listen to and
 * route to its panel selectors.
 */
function emitAppLink(kind: string, id: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('papercusp-log-link', { detail: { kind, id } }),
  );
}

const LogLine = memo(function LogLine({ index, event }: { index: number; event: LogEvent }) {
  const segments = useMemo(() => {
    const ansi = Anser.ansiToJson(event.msg, { use_classes: false, remove_empty: true }).map((p) => ({
      content: p.content,
      style: {
        color: p.fg ? `rgb(${p.fg})` : undefined,
        background: p.bg ? `rgb(${p.bg})` : undefined,
        fontWeight: p.decoration === 'bold' ? 600 : undefined,
        fontStyle: p.decoration === 'italic' ? 'italic' : undefined,
        textDecoration: p.decoration === 'underline' ? 'underline' : undefined,
      } as React.CSSProperties,
    }));
    return linkifyParts(ansi);
  }, [event.msg]);

  const sourceTag = event.source === 'harness' ? null : (
    <span className="h-log-source" title={event.source}>
      {shortPluginName(event.source)}
    </span>
  );

  return (
    <div className={`h-log-line ${event.level} ${classNameForLevel(event.level)}`}>
      <span className="h-log-no" aria-hidden="true">{String(index + 1).padStart(4, '0')}</span>
      <span className="h-log-ts">{formatTs(event.ts)}</span>
      {sourceTag}
      <span className={`h-log-tag ${event.level}`}>{labelForLevel(event.level)}</span>
      <span className="h-log-msg">
        {segments.map((seg, i) => {
          if (seg.href) {
            return (
              <a
                key={i}
                href={seg.href}
                target={seg.href.startsWith('http') ? '_blank' : undefined}
                rel={seg.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                style={seg.style}
                className="h-log-link"
              >
                {seg.content}
              </a>
            );
          }
          if (seg.appLink) {
            const a = seg.appLink;
            return (
              <button
                key={i}
                type="button"
                style={seg.style}
                className={`h-log-link h-log-link-app h-log-link-${a.kind}`}
                onClick={(ev) => { ev.preventDefault(); emitAppLink(a.kind, a.id); }}
              >
                {seg.content}
              </button>
            );
          }
          return <span key={i} style={seg.style}>{seg.content}</span>;
        })}
      </span>
    </div>
  );
});

/** Build the auto-derived tab strip from the events buffer. */
function deriveTabs(events: LogEvent[]): LogTab[] {
  const sources = new Set<string>();
  for (const e of events) sources.add(e.source);
  const pluginSources = Array.from(sources)
    .filter((s) => s.startsWith('plugin:'))
    .sort();
  const tabs: LogTab[] = [
    {
      id: 'all',
      label: 'All',
      filter: () => true,
      count: events.length,
    },
    {
      id: 'harness',
      label: 'Harness',
      filter: (e) => e.source === 'harness',
    },
    ...pluginSources.map<LogTab>((s) => ({
      id: s,
      label: shortPluginName(s),
      filter: (e) => e.source === s,
    })),
  ];
  return tabs;
}

export function LogView(props: LogViewProps) {
  const { events, tabs: tabsProp, activeTabId: activeTabIdProp, onTabChange } = props;
  const [internalActive, setInternalActive] = useState<string>('all');
  const activeTabId = activeTabIdProp ?? internalActive;
  const setActiveTabId = (id: string): void => {
    setInternalActive(id);
    onTabChange?.(id);
  };

  const tabs = useMemo(() => tabsProp ?? deriveTabs(events), [tabsProp, events]);
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const filtered = useMemo(
    () => activeTab ? events.filter(activeTab.filter) : events,
    [events, activeTab],
  );

  const ref = useRef<VirtuosoHandle>(null);
  const atBottomRef = useRef(true);
  const [paused, setPaused] = useState(false);
  // Count of events arrived while paused — for the "147 new" pill.
  const lastSeenLengthRef = useRef(filtered.length);
  const [unseenCount, setUnseenCount] = useState(0);

  useEffect(() => {
    if (paused) {
      // Track how many new events have arrived since pause started.
      const delta = Math.max(0, filtered.length - lastSeenLengthRef.current);
      setUnseenCount(delta);
    } else {
      lastSeenLengthRef.current = filtered.length;
      setUnseenCount(0);
      if (atBottomRef.current && ref.current && filtered.length > 0) {
        ref.current.scrollToIndex({ index: filtered.length - 1, behavior: 'auto' });
      }
    }
  }, [filtered.length, paused]);

  const onResume = (): void => {
    setPaused(false);
    lastSeenLengthRef.current = filtered.length;
    setUnseenCount(0);
    requestAnimationFrame(() => {
      if (ref.current && filtered.length > 0) {
        ref.current.scrollToIndex({ index: filtered.length - 1, behavior: 'auto' });
      }
    });
  };

  return (
    <div className="h-log-container">
      <div className="h-log-tabs" role="tablist">
        {tabs.map((tab) => {
          const count = tab.count ?? events.filter(tab.filter).length;
          const isActive = tab.id === activeTab?.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`h-log-tab${isActive ? ' active' : ''}`}
              onClick={() => setActiveTabId(tab.id)}
            >
              {tab.label}
              <span className="h-log-tab-count">{count}</span>
            </button>
          );
        })}
        <div className="h-log-tabs-spacer" />
        <button
          type="button"
          className={`h-log-pause-toggle${paused ? ' paused' : ''}`}
          onClick={() => (paused ? onResume() : setPaused(true))}
          title={paused ? 'Resume auto-scroll' : 'Pause auto-scroll'}
        >
          {paused ? '▶ Resume' : '⏸ Pause'}
        </button>
      </div>
      {filtered.length === 0 ? (
        <div className="h-empty">
          <span className="h-empty-icon">—</span>
          <span>{events.length === 0 ? 'waiting for log output…' : 'no events match this tab'}</span>
        </div>
      ) : (
        <div className="h-log-body">
          <Virtuoso
            ref={ref}
            data={filtered}
            className="h-log"
            style={{ height: '100%' }}
            atBottomStateChange={(atBottom) => { atBottomRef.current = atBottom; }}
            followOutput={paused ? false : 'smooth'}
            itemContent={(i, e) => <LogLine index={i} event={e} />}
          />
          {paused && unseenCount > 0 && (
            <button
              type="button"
              className="h-log-unseen-pill"
              onClick={onResume}
              title="Click to resume tailing"
            >
              ▼ {unseenCount} new event{unseenCount === 1 ? '' : 's'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
