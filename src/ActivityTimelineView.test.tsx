import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ACTIVITY_FILTERS,
  ActivityTimelineView,
  activityDayLabel,
  filterActivityEvents,
  formatEventTime,
  formatRelativeTime,
  groupActivityEventsByDay,
  type ActivityTimelineEvent,
} from './ActivityTimelineView';

/**
 * This package's vitest config does not enable globals, so @testing-library/react's automatic
 * per-test cleanup is never registered and renders accumulate in one jsdom document — every
 * query then fails with "Found multiple elements". Unmount explicitly.
 */
afterEach(cleanup);

/** Pinned clock — every relative/day assertion below is deterministic against it. */
const NOW = new Date('2026-09-17T22:10:00Z');

function at(iso: string): string {
  return iso;
}

const events: ActivityTimelineEvent[] = [
  {
    id: 'e1',
    kind: 'work-item',
    at: at('2026-09-17T21:59:00Z'),
    ref: 'WI-10000249',
    title: 'Freeze release source',
    actor: 'su-4163e',
    fromStatus: 'open',
    toStatus: 'wip',
    excerpt: 'Source frozen at e66be3c4ff7b.',
    details: [
      { label: 'Kind', value: 'feature' },
      { label: 'Harness', value: 'papercusp' },
    ],
    actions: [{ key: 'open-ref', label: 'Open work item' }],
  },
  {
    id: 'e2',
    kind: 'plan',
    at: at('2026-09-17T21:43:00Z'),
    ref: 'desktop-release-shared-project-history-2026-09-06',
    title: 'plan item advanced',
    planItem: 'P-002',
    toStatus: 'wip',
    actor: 'su-4163e',
  },
  {
    id: 'e3',
    kind: 'decision',
    at: at('2026-09-16T20:12:00Z'),
    ref: 'D-007',
    title: 'Freeze-and-converge is the default gate policy',
    actor: 'Avi',
    actorIsHuman: true,
  },
  {
    id: 'e4',
    kind: 'checkpoint',
    at: at('2026-09-15T09:30:00Z'),
    ref: 'WI-10001495',
    title: 'checkpoint written',
    actor: 'su-8ee75',
  },
];

describe('filterActivityEvents', () => {
  it('passes everything through under the "all" filter', () => {
    expect(filterActivityEvents(events, 'all', '')).toHaveLength(4);
  });

  it('narrows to a single kind', () => {
    expect(filterActivityEvents(events, 'decision', '').map((e) => e.id)).toEqual(['e3']);
  });

  it('matches free text case-insensitively across ref, title, actor and plan item', () => {
    expect(filterActivityEvents(events, 'all', 'FREEZE').map((e) => e.id)).toEqual(['e1', 'e3']);
    expect(filterActivityEvents(events, 'all', 'su-8ee75').map((e) => e.id)).toEqual(['e4']);
    expect(filterActivityEvents(events, 'all', 'P-002').map((e) => e.id)).toEqual(['e2']);
  });

  it('intersects the chip and the text filter rather than unioning them', () => {
    // 'freeze' alone matches e1 (work-item) and e3 (decision); the chip must cut it to one.
    expect(filterActivityEvents(events, 'decision', 'freeze').map((e) => e.id)).toEqual(['e3']);
  });
});

describe('groupActivityEventsByDay', () => {
  // 2026-09-15 is a TUESDAY, and en-GB renders the month as "Sept" — the older-date label is
  // matched by pattern rather than a hand-written string so a future ICU "Sep"/"Sept" change
  // cannot red this guard over a cosmetic difference it is not testing.
  const OLDER_DAY = /^Tue 15 Sept?$/;

  it('buckets newest-first into day groups with Today/Yesterday labels', () => {
    const groups = groupActivityEventsByDay(events, NOW);
    expect(groups.map((g) => g.label).slice(0, 2)).toEqual(['Today', 'Yesterday']);
    expect(groups[2].label).toMatch(OLDER_DAY);
    expect(groups[0].events.map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  it('re-sorts a caller that appends a live event out of order', () => {
    const outOfOrder = [events[2], events[0], events[3], events[1]];
    const groups = groupActivityEventsByDay(outOfOrder, NOW);
    expect(groups.map((g) => g.label).slice(0, 2)).toEqual(['Today', 'Yesterday']);
    expect(groups[2].label).toMatch(OLDER_DAY);
    expect(groups[0].events.map((e) => e.id)).toEqual(['e1', 'e2']);
  });
});

describe('formatRelativeTime', () => {
  it('renders each magnitude band', () => {
    expect(formatRelativeTime('2026-09-17T22:09:58Z', NOW)).toBe('just now');
    expect(formatRelativeTime('2026-09-17T22:09:30Z', NOW)).toBe('30s ago');
    expect(formatRelativeTime('2026-09-17T21:50:00Z', NOW)).toBe('20m ago');
    expect(formatRelativeTime('2026-09-17T19:10:00Z', NOW)).toBe('3h ago');
    expect(formatRelativeTime('2026-09-14T22:10:00Z', NOW)).toBe('3d ago');
  });

  it('returns null — never "NaN ago" — for a missing or unparseable instant', () => {
    expect(formatRelativeTime(null, NOW)).toBeNull();
    expect(formatRelativeTime(undefined, NOW)).toBeNull();
    expect(formatRelativeTime('not-a-date', NOW)).toBeNull();
  });
});

describe('formatEventTime / activityDayLabel degrade honestly', () => {
  it('renders a placeholder rather than NaN for an unparseable instant', () => {
    expect(formatEventTime('not-a-date')).toBe('--:--');
    expect(activityDayLabel('not-a-date', NOW)).toBe('Unknown date');
  });
});

describe('ActivityTimelineView rendering', () => {
  it('renders rows with time, kind, ref, transition and actor', () => {
    render(<ActivityTimelineView events={events} now={NOW} />);
    const row = screen.getByRole('button', { name: /WI-10000249/ });
    expect(within(row).getByText('WI-10000249')).toBeTruthy();
    expect(within(row).getByText('Work item')).toBeTruthy(); // visually-hidden kind label
    expect(within(row).getByText('open')).toBeTruthy();
    expect(within(row).getByText('wip')).toBeTruthy();
    expect(within(row).getByText('su-4163e')).toBeTruthy();
  });

  it('shows the skeleton while loading and NOT the empty state', () => {
    render(<ActivityTimelineView events={[]} loading now={NOW} />);
    expect(screen.getByLabelText('Loading activity')).toBeTruthy();
    expect(screen.queryByText('No activity yet in this pot')).toBeNull();
  });

  it('distinguishes a genuinely empty pot from a filter that matched nothing', () => {
    const { rerender } = render(<ActivityTimelineView events={[]} now={NOW} />);
    expect(screen.getByText('No activity yet in this pot')).toBeTruthy();

    rerender(<ActivityTimelineView events={events} query="zzzz-no-match" now={NOW} />);
    expect(screen.getByText('No matching activity')).toBeTruthy();
    expect(screen.queryByText('No activity yet in this pot')).toBeNull();
  });

  it('reports live state and age beside the dot', () => {
    render(
      <ActivityTimelineView events={events} live lastUpdatedAt="2026-09-17T22:08:00Z" now={NOW} />,
    );
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Live');
    expect(status.textContent).toContain('2m ago');
  });

  it('offers every documented filter chip with a count', () => {
    render(<ActivityTimelineView events={events} now={NOW} />);
    for (const { label } of ACTIVITY_FILTERS) {
      expect(screen.getByRole('button', { name: new RegExp(`^${label}`) })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: /^All/ }).textContent).toContain('4');
  });

  it('filters the list when a chip is pressed (uncontrolled)', async () => {
    const user = userEvent.setup();
    render(<ActivityTimelineView events={events} now={NOW} />);
    await user.click(screen.getByRole('button', { name: /^Decisions/ }));
    expect(screen.getByRole('button', { name: /^Decisions/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('button', { name: /WI-10000249/ })).toBeNull();
    expect(screen.getByRole('button', { name: /D-007/ })).toBeTruthy();
  });

  it('expands a row inline, exposing the detail panel it controls', async () => {
    const user = userEvent.setup();
    render(<ActivityTimelineView events={events} now={NOW} />);
    const row = screen.getByRole('button', { name: /WI-10000249/ });
    expect(row.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Source frozen at e66be3c4ff7b.')).toBeNull();

    await user.click(row);
    expect(screen.getByRole('button', { name: /WI-10000249/ }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Source frozen at e66be3c4ff7b.')).toBeTruthy();
    expect(screen.getByText('Harness')).toBeTruthy();
    expect(screen.getByText('papercusp')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /WI-10000249/ }));
    expect(screen.queryByText('Source frozen at e66be3c4ff7b.')).toBeNull();
  });

  it('fires onAction with the action key and its event', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<ActivityTimelineView events={events} now={NOW} defaultExpandedId="e1" onAction={onAction} />);
    await user.click(screen.getByRole('button', { name: 'Open work item' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toBe('open-ref');
    expect(onAction.mock.calls[0][1].id).toBe('e1');
  });

  it('is fully controlled when value + handler are supplied (the nuqs binding P-011 uses)', async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();
    render(
      <ActivityTimelineView events={events} now={NOW} filter="all" onFilterChange={onFilterChange} />,
    );
    await user.click(screen.getByRole('button', { name: /^Plans/ }));
    expect(onFilterChange).toHaveBeenCalledWith('plan');
    // Controlled: the prop still says 'all', so the view must NOT have self-updated.
    expect(screen.getByRole('button', { name: /^All/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /WI-10000249/ })).toBeTruthy();
  });

  it('does not fetch: rendering performs no network call', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch' as never);
    render(<ActivityTimelineView events={events} now={NOW} />);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('ActivityTimelineView accessibility', () => {
  it('groups rows under a day heading in an ordered list', () => {
    render(<ActivityTimelineView events={events} now={NOW} />);
    expect(screen.getByRole('heading', { name: 'Today' })).toBeTruthy();
    expect(screen.getByRole('list', { name: /Today/ })).toBeTruthy();
  });

  it('names the filter group and the search input', () => {
    render(<ActivityTimelineView events={events} now={NOW} />);
    expect(screen.getByRole('group', { name: 'Filter timeline by event kind' })).toBeTruthy();
    expect(screen.getByLabelText('Filter history')).toBeTruthy();
  });

  it('announces liveness politely so a reconnect cannot interrupt a row read', () => {
    render(<ActivityTimelineView events={events} live now={NOW} />);
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
  });

  it('marks each row as an expandable control pointing at its own panel', async () => {
    const user = userEvent.setup();
    render(<ActivityTimelineView events={events} now={NOW} />);
    const row = screen.getByRole('button', { name: /WI-10000249/ });
    const panelId = row.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    await user.click(row);
    expect(document.getElementById(panelId as string)).toBeTruthy();
  });
});
