import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guards the ActivityTimelineView stylesheet contract (plan
 * project-history-tab-desktop-and-portal-2026-09-16, P-010) — the same three invariants
 * ProjectHistoryView.css.test.ts enforces for its sibling:
 *
 *  1. every `atl-*` class the component source can emit has at least one rule in the stylesheet;
 *  2. the stylesheet references ONLY `--ph-*` custom properties, so a host themes it purely
 *     through the contract P-002 (desktop) and P-003 (portal) already bound;
 *  3. every `--ph-*` token consumed has a standalone fallback declared, so the view renders
 *     correctly in a host that has bound only some of them.
 *
 * The falsifiability control at the bottom proves (1) can fail. It mutates a STRING, never the
 * tracked file — the shared tree is swept into commits every few minutes, so a probe that edits
 * the real stylesheet can be committed mid-run (CLAUDE.md, "Proving a guard is falsifiable").
 */

const here = dirname(fileURLToPath(import.meta.url));
/** Subject override for copy-out mutation probes; unset ⇒ the real stylesheet. */
const CSS_PATH = process.env.ATL_CSS_SUBJECT ?? join(here, 'ActivityTimelineView.css');
const TSX_PATH = join(here, 'ActivityTimelineView.tsx');

const CLASS_TOKEN = /\batl-[a-z0-9]+(?:-[a-z0-9]+)*\b/g;

/** Every `atl-*` class token the component source can emit — static scan, so conditional branches count. */
export function emittedClassNames(source: string): string[] {
  const names = new Set<string>();
  for (const match of source.matchAll(CLASS_TOKEN)) names.add(match[0]);
  return [...names].sort();
}

/** Every `atl-*` class the stylesheet has at least one selector for. */
export function styledClassNames(css: string): Set<string> {
  const names = new Set<string>();
  for (const match of css.matchAll(/\.(atl-[a-z0-9]+(?:-[a-z0-9]+)*)(?![a-z0-9-])/g)) names.add(match[1]);
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

describe('ActivityTimelineView.css contract', () => {
  it('has a rule for every atl-* class the component emits', () => {
    const emitted = emittedClassNames(source);
    expect(emitted.length).toBeGreaterThan(20); // calibration: the scan really found the classes
    expect(unstyledClasses(source, css)).toEqual([]);
  });

  it('references only --ph-* custom properties (the host theming contract)', () => {
    const refs = customPropertyRefs(css);
    expect(refs.length).toBeGreaterThan(40); // calibration: token-driven, not hard-coded
    expect(refs.filter((ref) => !ref.startsWith('--ph-'))).toEqual([]);
  });

  it('declares a standalone fallback for every --ph-* token it consumes', () => {
    const declared = declaredCustomProperties(css);
    const consumed = [...new Set(customPropertyRefs(css))].sort();
    expect(consumed.filter((token) => !declared.has(token))).toEqual([]);
  });

  it('stays inside the ProjectHistoryView token contract — introduces no new --ph-* token', () => {
    const sibling = readFileSync(join(here, 'ProjectHistoryView.css'), 'utf8');
    const siblingTokens = declaredCustomProperties(sibling);
    expect(siblingTokens.size).toBeGreaterThan(10); // calibration: the sibling really declares a contract
    const mine = [...new Set(customPropertyRefs(css))].sort();
    expect(mine.filter((token) => !siblingTokens.has(token))).toEqual([]);
  });

  it('is falsifiable: a stylesheet missing one emitted class is reported as unstyled', () => {
    const victim = emittedClassNames(source)[0];
    const incomplete = css.replace(new RegExp(`\\.${victim}(?![a-z0-9-])`, 'g'), '.zz-rule-removed');
    expect(incomplete).not.toBe(css); // a no-op mutation would make this control vacuous
    expect(unstyledClasses(source, incomplete)).toContain(victim);
  });
});
