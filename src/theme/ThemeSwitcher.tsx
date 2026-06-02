'use client';

import { type CSSProperties } from 'react';
import { Contrast, Moon, Palette, Sun, type LucideIcon } from 'lucide-react';
import { useTheme } from './useTheme';

export interface ThemeOption {
  id: string;
  label: string;
}

export interface ThemeSwitcherProps {
  /** Theme manifest — pass `THEMES` from `@papercusp/design-tokens/themes`. */
  themes: readonly ThemeOption[];
  /** Optional override of the per-theme icon (keyed by theme id). */
  icons?: Record<string, LucideIcon>;
  className?: string;
}

// Sensible defaults; consumers can override via the `icons` prop.
const DEFAULT_ICONS: Record<string, LucideIcon> = {
  frost: Moon,
  black: Contrast,
  light: Sun,
};

const wrapStyle: CSSProperties = {
  display: 'inline-flex',
  gap: 2,
  padding: 2,
  borderRadius: 8,
  background: 'var(--bg-2, rgba(127,127,127,0.12))',
  border: '1px solid var(--border, rgba(127,127,127,0.22))',
};

function btnStyle(active: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    color: active ? 'var(--accent-ink, #fff)' : 'var(--fg-dim, currentColor)',
    background: active ? 'var(--accent, #3b82f6)' : 'transparent',
    transition: 'background 120ms ease, color 120ms ease',
  };
}

/**
 * Headless theme switcher — a segmented control over the supplied themes.
 * Styling uses the host's design-token CSS vars (with fallbacks) so it stays
 * theme-reactive without hardcoding brand values; override via `className`.
 */
export function ThemeSwitcher({ themes, icons = DEFAULT_ICONS, className }: ThemeSwitcherProps) {
  const { theme, setTheme } = useTheme();
  return (
    <div role="group" aria-label="Theme" className={className} style={wrapStyle}>
      {themes.map((t) => {
        const Icon = icons[t.id] ?? Palette; // ?? guard — a missing key never crashes the subtree
        const active = theme === t.id;
        return (
          <button
            key={t.id}
            type="button"
            title={t.label}
            aria-label={t.label}
            aria-pressed={active}
            data-theme-option={t.id}
            onClick={() => setTheme(t.id)}
            style={btnStyle(active)}
          >
            <Icon size={15} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
