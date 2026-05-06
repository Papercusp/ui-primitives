import { render } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import * as axeMatchers from 'vitest-axe/matchers';
import { axe } from 'vitest-axe';

import { StatCard } from './StatCard';
import { StatusPill } from './StatusPill';

expect.extend(axeMatchers);

afterEach(() => {
  document.body.innerHTML = '';
});

test('StatCard has no axe violations', async () => {
  const { container } = render(
    <StatCard label="Latency" value="42ms" tone="good" />,
  );
  expect(await axe(container)).toHaveNoViolations();
});

test('StatusPill has no axe violations across statuses', async () => {
  for (const status of ['todo', 'in_progress', 'passed', 'failing', 'blocked'] as const) {
    const { container, unmount } = render(<StatusPill status={status} />);
    expect(await axe(container)).toHaveNoViolations();
    unmount();
  }
});
