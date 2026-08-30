import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TextInput } from './TextInput';

describe('shared TextInput control', () => {
  it('renders the registry contract with leading and trailing slots', () => {
    const html = renderToStaticMarkup(
      <TextInput value="query" readOnly leading={<span>search</span>} trailing={<kbd>⌘K</kbd>} />,
    );
    expect(html).toContain('pc-text-input-wrap');
    expect(html).toContain('value="query"');
    expect(html).toContain('>search<');
    expect(html).toContain('>⌘K<');
  });

  it('keeps the plain input class contract', () => {
    expect(renderToStaticMarkup(<TextInput placeholder="Search" />)).toContain('class="pc-text-input"');
  });
});
