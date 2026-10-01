// @vitest-environment jsdom

import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import {
  PlanDocumentView,
  preparePlanDocument,
} from './PlanDocumentView';

// Exercise the installed public renderer and its REAL Lute compiler. Script
// IDs only replace network loading of assets that the desktop already mirrors.
const scripts: HTMLScriptElement[] = [];
beforeAll(() => {
  const require = createRequire(import.meta.url);
  const dist = dirname(require.resolve('vditor'));
  const lute = readFileSync(join(dist, 'js/lute/lute.min.js'), 'utf8');
  new Function('window', 'module', 'exports', lute)(window, undefined, undefined);
  vi.stubGlobal('Lute', (window as unknown as { Lute: unknown }).Lute);
  for (const id of ['vditorLuteScript', 'vditorI18nScripten_US', 'vditorIconScript']) {
    const script = document.createElement('script');
    script.id = id;
    document.head.appendChild(script);
    scripts.push(script);
  }
});

afterAll(async () => {
  cleanup();
  await preparePlanDocument('x'.repeat(512 * 1024 + 1));
  for (const script of scripts) script.remove();
  vi.unstubAllGlobals();
});

it('prepared public Vditor output matches ordinary rendering with anchors, tables, footnotes, wiki links and HTML', async () => {
  const body = [
    '# Exact heading', '', 'See [[pot/page|Page]] and `inline code`.', '',
    '| Column | Value |', '| --- | --- |', '| one | **two** |', '',
    '- first', '- second', '', 'A note[^one] and :smile:.', '',
    '[^one]: footnote', '', '<b>Inline HTML</b>',
  ].join('\n');
  // Both paths must mount: Vditor's anchor adapter reads document, so a
  // detached baseline omits its normal anchor classes and event wiring.
  const ordinaryParsed = vi.fn();
  const ordinary = render(<PlanDocumentView value={body} theme="light" outline={false} showJump={false} onParsed={ordinaryParsed} />);
  await waitFor(() => expect(ordinaryParsed).toHaveBeenCalledOnce());
  const ordinaryHtml = (ordinaryParsed.mock.calls[0]![0] as HTMLElement).innerHTML;
  ordinary.unmount();
  expect(await preparePlanDocument(body)).toBe(true);
  const parsed = vi.fn();
  render(<PlanDocumentView value={body} theme="light" outline={false} showJump={false} onParsed={parsed} />);
  await waitFor(() => expect(parsed).toHaveBeenCalledOnce());
  const prepared = parsed.mock.calls[0]![0] as HTMLElement;
  expect(prepared.innerHTML).toBe(ordinaryHtml);
  expect(prepared.classList.contains('vditor-reset--anchor')).toBe(true);
  expect(prepared.querySelector('table')).not.toBeNull();
  const pageLink = Array.from(prepared.querySelectorAll('a')).find((link) => link.textContent === 'Page');
  expect(pageLink?.getAttribute('href')).toBe('/wiki?target=page&harness=pot');
  expect(prepared.querySelector('h1[id]')).not.toBeNull();
});
