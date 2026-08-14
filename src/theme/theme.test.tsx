import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { ThemeSwitcher } from './ThemeSwitcher';
import {
  applyTheme,
  DEFAULT_THEME,
  getActiveTheme,
  PREPAINT_SNIPPET,
  STORAGE_KEY,
  subscribe,
  THEME_EVENT,
} from './theme-runtime';

const THEMES = [
  { id: 'frost', label: 'Frost' },
  { id: 'black', label: 'Black' },
  { id: 'light', label: 'Light' },
];

// Node 25 + this jsdom build ship a non-functional localStorage stub
// ([object Object], no methods). Install a Map-backed Storage for these tests.
beforeEach(() => {
  const store = new Map<string, string>();
  const mock: Storage = {
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    setItem: (k, val) => void store.set(k, String(val)),
    removeItem: (k) => void store.delete(k),
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: mock, configurable: true });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', { value: mock, configurable: true });
  }
});

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  localStorage.clear();
  document.body.innerHTML = '';
});

test('defaults to frost when nothing is set', () => {
  expect(getActiveTheme()).toBe(DEFAULT_THEME);
});

test('applyTheme sets the attribute, persists, and dispatches the event', () => {
  const seen: string[] = [];
  const onEvent = (e: Event) => seen.push((e as CustomEvent).detail.id);
  window.addEventListener(THEME_EVENT, onEvent);

  applyTheme('black');

  expect(document.documentElement.dataset.theme).toBe('black');
  expect(localStorage.getItem(STORAGE_KEY)).toBe('black');
  expect(seen).toEqual(['black']);
  expect(getActiveTheme()).toBe('black');

  window.removeEventListener(THEME_EVENT, onEvent);
});

test('getActiveTheme prefers the live attribute over storage', () => {
  localStorage.setItem(STORAGE_KEY, 'light');
  document.documentElement.dataset.theme = 'black';
  expect(getActiveTheme()).toBe('black');
});

test('subscribe fires on change and stops after cleanup', () => {
  const cb = vi.fn();
  const unsub = subscribe(cb);
  applyTheme('light');
  expect(cb).toHaveBeenCalledTimes(1);
  unsub();
  applyTheme('frost');
  expect(cb).toHaveBeenCalledTimes(1);
});

test('PREPAINT_SNIPPET applies the stored theme synchronously', () => {
  localStorage.setItem(STORAGE_KEY, 'light');
  // eslint-disable-next-line no-eval
  (0, eval)(PREPAINT_SNIPPET);
  expect(document.documentElement.dataset.theme).toBe('light');
});

test('ThemeSwitcher renders the themes and switches on click', () => {
  render(<ThemeSwitcher themes={THEMES} />);
  const black = screen.getByRole('button', { name: 'Black' });
  expect(black.getAttribute('aria-pressed')).toBe('false');

  fireEvent.click(black);

  expect(document.documentElement.dataset.theme).toBe('black');
  expect(black.getAttribute('aria-pressed')).toBe('true');
});

test('ThemeSwitcher falls back to a default icon for an unknown theme id', () => {
  // A theme id with no icon mapping must not crash the subtree (?? guard).
  expect(() =>
    render(<ThemeSwitcher themes={[{ id: 'neon', label: 'Neon' }]} />),
  ).not.toThrow();
  expect(screen.getByRole('button', { name: 'Neon' })).toBeTruthy();
});
