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

const LogLine = memo(function LogLine({ index, event }: { index: number; event: LogEvent }) {
  const parts = useMemo(
    () =>
      Anser.ansiToJson(event.msg, { use_classes: false, remove_empty: true }).map((p) => ({
        content: p.content,
        style: {
          color: p.fg ? `rgb(${p.fg})` : undefined,
          background: p.bg ? `rgb(${p.bg})` : undefined,
          fontWeight: p.decoration === 'bold' ? 600 : undefined,
          fontStyle: p.decoration === 'italic' ? 'italic' : undefined,
          textDecoration: p.decoration === 'underline' ? 'underline' : undefined,
        },
      })),
    [event.msg],
  );

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
        {parts.map((p, i) => (
          <span key={i} style={p.style}>{p.content}</span>
        ))}
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
