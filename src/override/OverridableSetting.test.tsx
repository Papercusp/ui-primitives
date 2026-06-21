// @vitest-environment jsdom
/**
 * OverridableSetting — the shared presentational override primitive
 * (sentinel-as-herald-2026-06-21). Mirrors the render-test style of
 * ModelTiersOverride.test.tsx: badge text flips override/default, the reset button
 * only renders when overridden AND onReset is given, reset fires onReset, busy
 * disables it, and both badge looks (chip / inline) reproduce the existing classes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import OverridableSetting from './OverridableSetting';

afterEach(cleanup);

describe('OverridableSetting badge', () => {
  it('shows "default" (not "override") when not overridden', () => {
    render(<OverridableSetting label="Wake cadence floor" isOverridden={false} />);
    expect(screen.getByText('default')).toBeTruthy();
    expect(screen.queryByText('override')).toBeNull();
  });

  it('shows "override" (not "default") when overridden', () => {
    render(<OverridableSetting label="Wake cadence floor" isOverridden onReset={vi.fn()} />);
    expect(screen.getByText('override')).toBeTruthy();
    expect(screen.queryByText('default')).toBeNull();
  });

  it('applies the --on badge modifier only when overridden', () => {
    const { rerender } = render(<OverridableSetting label="X" isOverridden={false} />);
    expect(screen.getByText('default').className).not.toContain('pc-override-badge--on');
    rerender(<OverridableSetting label="X" isOverridden onReset={vi.fn()} />);
    expect(screen.getByText('override').className).toContain('pc-override-badge--on');
  });
});

describe('OverridableSetting reset button', () => {
  it('is hidden when not overridden (even if onReset is given)', () => {
    render(<OverridableSetting label="X" isOverridden={false} onReset={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /reset/i })).toBeNull();
  });

  it('is hidden when overridden but no onReset is provided', () => {
    render(<OverridableSetting label="X" isOverridden />);
    expect(screen.queryByRole('button', { name: /reset/i })).toBeNull();
  });

  it('is shown when overridden AND onReset is provided, and fires onReset', () => {
    const onReset = vi.fn();
    render(<OverridableSetting label="Max bees" isOverridden onReset={onReset} />);
    const btn = screen.getByRole('button', { name: 'Reset Max bees to default' });
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('is disabled when busy', () => {
    const onReset = vi.fn();
    render(<OverridableSetting label="X" isOverridden busy onReset={onReset} />);
    const btn = screen.getByRole('button', { name: /reset/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('renders a custom resetLabel', () => {
    render(<OverridableSetting label="X" isOverridden onReset={vi.fn()} resetLabel="clear" />);
    expect(screen.getByRole('button', { name: /reset/i }).textContent).toBe('clear');
  });
});

describe('OverridableSetting layout', () => {
  it('renders the label and the children control slot', () => {
    render(
      <OverridableSetting label="Model tier" isOverridden={false}>
        <input aria-label="model spec" />
      </OverridableSetting>,
    );
    expect(screen.getByText('Model tier')).toBeTruthy();
    expect(screen.getByLabelText('model spec')).toBeTruthy();
  });

  it("chip is the default badge look (no --inline modifier)", () => {
    render(<OverridableSetting label="X" isOverridden={false} />);
    expect(screen.getByText('default').className).not.toContain('pc-override-badge--inline');
  });

  it('badgeStyle="inline" reproduces the knobbadge (right-aligned) look', () => {
    render(<OverridableSetting label="X" isOverridden={false} badgeStyle="inline" />);
    const badge = screen.getByText('default');
    expect(badge.className).toContain('pc-override-badge--inline');
  });
});
