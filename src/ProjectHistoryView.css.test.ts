import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guards the ProjectHistoryView stylesheet contract (plan
 * project-history-tab-desktop-and-portal-2026-09-16, P-001 / R-3):
 *
 *  1. every `build-*` class the component source can emit has at least one rule in the shipped
 *     stylesheet (no silently-unstyled element when SideStage's stylesheet and this component drift);
 *  2. the stylesheet references ONLY `--ph-*` custom properties, so a host themes it purely through
 *     that contract (no SideStage / host-specific tokens leak in);
 *  3. every `--ph-*` token the stylesheet consumes has a standalone fallback declared in it.
 *
 * The falsifiability control at the bottom proves (1) can fail: a deliberately-incomplete copy of
 * the real stylesheet (one rule removed) must be reported as unstyled. It mutates a string, never
 * the tracked file.
 */

const here = dirname(fileURLToPath(import.meta.url));
/**
 * Subject override for copy-out mutation probes (CLAUDE.md "Proving a guard is falsifiable"):
 * point `PH_CSS_SUBJECT` at a deliberately-incomplete COPY of the stylesheet to record a
 * ledger-backed counterexample run without ever mutating the tracked file. Unset ⇒ the real one.
 */
const CSS_PATH = process.env.PH_CSS_SUBJECT ?? join(here, 'ProjectHistoryView.css');
const TSX_PATH = join(here, 'ProjectHistoryView.tsx');

const CLASS_TOKEN = /\bbuild-[a-z0-9]+(?:-[a-z0-9]+)*\b/g;

/** Every `build-*` class token the component source can emit — static scan, so conditional branches count too. */
export function emittedClassNames(source: string): string[] {
  const names = new Set<string>();
  for (const match of source.matchAll(CLASS_TOKEN)) names.add(match[0]);
  return [...names].sort();
}

/** Every `build-*` class a stylesheet has at least one selector for. */
export function styledClassNames(css: string): Set<string> {
  const names = new Set<string>();
  for (const match of css.matchAll(/\.(build-[a-z0-9]+(?:-[a-z0-9]+)*)(?![a-z0-9-])/g)) names.add(match[1]);
  return names;
}

/** Emitted classes with no rule in `css`. Empty means the stylesheet covers the component. */
export function unstyledClasses(source: string, css: string): string[] {
  const styled = styledClassNames(css);
  return emittedClassNames(source).filter((name) => !styled.has(name));
}

function customPropertyRefs(css: string): string[] {
  return [...css.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)/g)].map((match) => match[1]);
}

function declaredCustomProperties(css: string): Set<string> {
  return new Set([...css.matchAll(/(?:^|[\s;{])(--ph-[a-zA-Z0-9_-]+)\s*:/g)].map((match) => match[1]));
}

const source = readFileSync(TSX_PATH, 'utf8');
const css = readFileSync(CSS_PATH, 'utf8');

describe('ProjectHistoryView.css contract', () => {
  it('has a rule for every build-* class the component emits', () => {
    const emitted = emittedClassNames(source);
    expect(emitted.length).toBeGreaterThan(20); // calibration: the scan actually found the component's classes
    expect(unstyledClasses(source, css)).toEqual([]);
  });

  it('references only --ph-* custom properties (the host theming contract)', () => {
    const refs = customPropertyRefs(css);
    expect(refs.length).toBeGreaterThan(50); // calibration: the stylesheet is token-driven, not hard-coded
    expect(refs.filter((ref) => !ref.startsWith('--ph-'))).toEqual([]);
  });

  it('declares a standalone fallback for every --ph-* token it consumes', () => {
    const declared = declaredCustomProperties(css);
    const consumed = [...new Set(customPropertyRefs(css))].sort();
    expect(consumed.filter((token) => !declared.has(token))).toEqual([]);
  });

  it('is falsifiable: a stylesheet missing one emitted class is reported as unstyled', () => {
    const victim = emittedClassNames(source)[0];
    const incomplete = css.replace(new RegExp(`\\.${victim}(?![a-z0-9-])`, 'g'), '.zz-rule-removed');
    expect(incomplete).not.toBe(css); // a no-op mutation would make this control vacuous
    expect(unstyledClasses(source, incomplete)).toContain(victim);
  });
});
