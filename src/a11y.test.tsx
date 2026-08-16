import { render } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import * as axeMatchers from 'vitest-axe/matchers';
import { axe } from 'vitest-axe';

import { StatCard } from './StatCard';
import { StatusPill } from './StatusPill';
import { JsonTree } from './JsonTree';
import { MarkdownView } from './MarkdownView';

expect.extend(axeMatchers);

// Panel + LogView use portals / Virtuoso respectively — covered by
// operator E2E (axe-core/playwright) in apps/operator/e2e/, not here.

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

test('JsonTree has no axe violations (object input)', async () => {
  const { container } = render(
    <JsonTree data={{ name: 'harness-1', stats: { passed: 12, failed: 0 } }} />,
  );
  expect(await axe(container)).toHaveNoViolations();
});

test('JsonTree has no axe violations (primitive input)', async () => {
  const { container } = render(<JsonTree data="just a string" />);
  expect(await axe(container)).toHaveNoViolations();
});

test('MarkdownView has no axe violations (rich content)', async () => {
  const md = `# Heading\n\n- item one\n- item two\n\n[link](https://example.com)\n\n\`code\``;
  const { container } = render(<MarkdownView source={md} />);
  expect(await axe(container)).toHaveNoViolations();
});

test('MarkdownView has no axe violations (empty content)', async () => {
  const { container } = render(<MarkdownView source="" />);
  expect(await axe(container)).toHaveNoViolations();
});
