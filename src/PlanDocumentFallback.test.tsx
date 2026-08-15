// @vitest-environment jsdom

/**
 * Recurrence guard for WI-39341 (SideStage History → "Read full plan").
 *
 * When the Vditor runtime cannot load, PlanDocumentView degrades to raw text.
 * That degraded surface used to take its background from a hardcoded dark
 * literal in the stylesheet and its foreground from the host's `--fg` token.
 * On a light-themed host the two disagreed — measured in the live SideStage
 * dialog at rgb(40,35,31) on rgb(25,35,42), about 1.1:1 — so the fallback was
 * invisible and a degraded renderer read to the user as a dead button.
 *
 * Asserting "the fallback renders" would not have caught that: it did render.
 * The property that actually failed is that the two colours must come from ONE
 * decision and must stay legible, so that is what is asserted here, in
 * measured contrast rather than by naming specific hex values.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const { previewSpy } = vi.hoisted(() => ({ previewSpy: vi.fn() }));

vi.mock('vditor', () => ({
  default: { preview: previewSpy, outlineRender: vi.fn() },
}));

import { PlanDocumentView, planDocumentFallbackSurface, type PlanDocumentTheme } from './PlanDocumentView';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  previewSpy.mockReset();
});

/** WCAG 2.x relative luminance. */
function relativeLuminance(rgb: readonly [number, number, number]): number {
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function parseColor(value: string): [number, number, number] {
  const hex = value.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = Number.parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = value.trim().match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  throw new Error(`Fallback surface returned a colour this guard cannot measure: ${value}`);
}

function contrastRatio(foreground: string, background: string): number {
  const [light, dark] = [relativeLuminance(parseColor(foreground)), relativeLuminance(parseColor(background))]
    .sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

const THEMES: PlanDocumentTheme[] = ['dark', 'light'];

/**
 * The colours measured off the live SideStage dialog while the bug was open,
 * kept as a permanent control: a threshold that this pair passes is a
 * threshold that would have missed the regression entirely.
 */
const MEASURED_REGRESSION = { color: 'rgb(40, 35, 31)', background: 'rgb(25, 35, 42)' };

describe('plan document raw-text fallback surface', () => {
  it('is calibrated: the pair measured during the outage fails this threshold', () => {
    expect(contrastRatio(MEASURED_REGRESSION.color, MEASURED_REGRESSION.background))
      .toBeLessThan(4.5);
  });

  it.each(THEMES)('stays legible in the %s theme', (theme) => {
    const { background, color } = planDocumentFallbackSurface(theme);

    // 4.5:1 is the WCAG AA threshold for body text. The regression measured
    // about 1.1:1, so any recurrence fails here by a wide margin.
    expect(contrastRatio(color, background)).toBeGreaterThanOrEqual(4.5);
  });

  it('supplies both halves of the pair for every theme, never one alone', () => {
    for (const theme of THEMES) {
      const surface = planDocumentFallbackSurface(theme);
      // A half-specified surface is what lets the host supply the other half
      // from an unrelated token — the exact defect under guard.
      expect(surface.background).toBeTruthy();
      expect(surface.color).toBeTruthy();
    }
  });

  it('does not reuse one theme\'s surface for the other', () => {
    expect(planDocumentFallbackSurface('dark')).not.toEqual(planDocumentFallbackSurface('light'));
  });

  it.each(THEMES)('renders the %s fallback with that surface when the renderer fails', async (theme) => {
    previewSpy.mockRejectedValue(new Error('lute.min.js 404 — asset mirror unavailable'));

    render(<PlanDocumentView value={'# Plan body'} theme={theme} outline={false} showJump={false} />);

    const notice = await screen.findByRole('status');
    await waitFor(() => expect(notice.querySelector('pre')).not.toBeNull());
    const block = notice.querySelector('pre') as HTMLPreElement;

    // Read the inline style the component actually applied, so a call site that
    // stops threading `theme` through is caught as well as a bad palette.
    const expected = planDocumentFallbackSurface(theme);
    expect(contrastRatio(block.style.color, block.style.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    expect(parseColor(block.style.backgroundColor)).toEqual(parseColor(expected.background));
    expect(parseColor(block.style.color)).toEqual(parseColor(expected.color));
    expect(block.textContent).toContain('# Plan body');
  });
});
