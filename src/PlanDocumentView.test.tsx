// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';

const { previewSpy, outlineSpy } = vi.hoisted(() => ({
  previewSpy: vi.fn(),
  outlineSpy: vi.fn(),
}));

vi.mock('vditor', () => ({
  default: {
    preview: previewSpy,
    outlineRender: outlineSpy,
  },
}));

import {
  PlanDocumentFrontmatter,
  PlanDocumentJump,
  PlanDocumentView,
  attachPlanDocumentRefClickHandler,
  decoratePlanDocumentDom,
  neutralizePlanDocumentPlantuml,
  rankPlanDocumentCandidates,
  resolvePlanDocumentTheme,
  stripPlanFrontmatter,
} from "./PlanDocumentView";

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  previewSpy.mockReset();
  outlineSpy.mockReset();
  vi.useRealTimers();
  delete document.documentElement.dataset.theme;
  document.documentElement.style.removeProperty("--bg");
});

describe('shared plan document transforms', () => {
  it('strips only a leading frontmatter block', () => {
    expect(stripPlanFrontmatter('---\ntitle: Demo\n---\n# Body')).toBe('# Body');
    expect(stripPlanFrontmatter('# Body\n\n---\nnot frontmatter')).toBe('# Body\n\n---\nnot frontmatter');
  });

  it('neutralizes exact PlantUML language classes before Vditor adapters run', () => {
    const transformed = neutralizePlanDocumentPlantuml(
      '<code class="language-plantuml">secret</code><code class="language-plantumlish">safe</code>',
    );
    expect(transformed).toContain('language-plantuml-neutralized');
    expect(transformed).toContain('language-plantumlish');
    expect(transformed).not.toContain('class="language-plantuml"');
  });

  it('decorates statuses, item ids, effective state, and prose references', () => {
    const root = document.createElement('div');
    root.innerHTML = '<ul><li><strong>P-001</strong> <code>todo</code> see D-002</li></ul>';
    decoratePlanDocumentDom(root, [
      { id: 'P-001', text: 'work', storedStatus: 'todo', effectiveStatus: 'blocked' },
    ]);

    expect(root.querySelector('li')?.dataset.planItem).toBe('P-001');
    expect(root.querySelector('code')?.dataset.planStatus).toBe('todo');
    expect(root.querySelector('.pc-plan-badge')?.textContent).toBe('blocked');
    expect(root.querySelector<HTMLAnchorElement>('[data-plan-ref]')?.dataset.planRef).toBe('D-002');
  });

  it('delegates reference clicks and returns a real teardown', () => {
    const root = document.createElement('div');
    root.innerHTML = '<ul><li><strong>P-001</strong> target</li></ul><p>See P-001</p>';
    decoratePlanDocumentDom(root, undefined);
    const destination = root.querySelector<HTMLElement>('[data-plan-item]')!;
    destination.scrollIntoView = vi.fn();
    const detach = attachPlanDocumentRefClickHandler(root);
    fireEvent.click(root.querySelector('[data-plan-ref]')!);
    expect(destination.scrollIntoView).toHaveBeenCalledOnce();
    detach();
    fireEvent.click(root.querySelector('[data-plan-ref]')!);
    expect(destination.scrollIntoView).toHaveBeenCalledOnce();
  });

  it('ranks exact, prefix, then text matches and caps the result', () => {
    const candidates = [
      { id: 'P-100', label: 'P-100', hint: 'parser', kind: 'item' as const },
      { id: 'P-1', label: 'P-1', hint: 'exact', kind: 'item' as const },
      { id: 'P-12', label: 'P-12', hint: 'prefix', kind: 'item' as const },
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `D-${String(index + 1).padStart(3, '0')}`,
        label: `D-${String(index + 1).padStart(3, '0')}`,
        hint: 'parser',
        kind: 'decision' as const,
      })),
    ];
    const ranked = rankPlanDocumentCandidates(candidates, 'P-1');
    expect(ranked[0]?.id).toBe('P-1');
    expect(ranked.map((candidate) => candidate.id)).toEqual(expect.arrayContaining(['P-12', 'P-100']));
    expect(rankPlanDocumentCandidates(candidates, 'parser')).toHaveLength(8);
  });
});

describe('shared plan reader components', () => {
  it('renders scalar frontmatter without stringifying nested objects', () => {
    render(
      <PlanDocumentFrontmatter
        slug="demo"
        frontmatter={{ status: 'ready', owners: ['avi', 'agent'], nested: { hidden: true } }}
      />,
    );
    expect(screen.getByText('demo')).toBeTruthy();
    expect(screen.getByText('avi, agent')).toBeTruthy();
    expect(screen.queryByText('[object Object]')).toBeNull();
  });

  it('jumps to rendered items from keyboard search', () => {
    const scope = document.createElement('div');
    const destination = document.createElement('div');
    destination.dataset.planItem = 'P-007';
    destination.scrollIntoView = vi.fn();
    scope.appendChild(destination);
    const scopeRef = createRef<HTMLElement>();
    scopeRef.current = scope;
    render(
      <PlanDocumentJump
        items={[{ id: 'P-007', text: 'target item' }]}
        decisions={[]}
        scopeRef={scopeRef}
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'P-007' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(destination.scrollIntoView).toHaveBeenCalledOnce();
  });

  it('renders through Vditor with local assets, strips frontmatter, and decorates before callback', async () => {
    previewSpy.mockImplementation(async (root: HTMLElement, markdown: string) => {
      root.innerHTML = `<ul><li><strong>P-001</strong> <code>todo</code> ${markdown}</li></ul>`;
    });
    const onParsed = vi.fn((root: HTMLElement) => {
      expect(root.querySelector('li')?.dataset.planItem).toBe('P-001');
    });
    render(
      <PlanDocumentView
        value={'---\ntitle: Demo\n---\nBody'}
        slug="demo"
        frontmatter={{ title: 'Demo', status: 'ready' }}
        items={[{ id: 'P-001', text: 'body', storedStatus: 'todo', effectiveStatus: 'todo' }]}
        decisions={[]}
        outline={false}
        showJump={false}
        onParsed={onParsed}
      />,
    );

    await waitFor(() => expect(previewSpy).toHaveBeenCalledOnce());
    expect(previewSpy.mock.calls[0]?.[1]).toBe('Body');
    expect(previewSpy.mock.calls[0]?.[2]).toMatchObject({ cdn: '/vditor', anchor: 1 });
    expect(onParsed).toHaveBeenCalledOnce();
  });

  it("inherits light, dark, and live host theme changes when no override is supplied", async () => {
    document.documentElement.dataset.theme = "light";
    document.documentElement.style.setProperty("--bg", "#f4f0e8");
    expect(resolvePlanDocumentTheme()).toBe("light");

    render(
      <PlanDocumentView
        value="# Theme"
        outline={false}
        showJump={false}
        showFrontmatter={false}
      />,
    );
    await waitFor(() => {
      expect(previewSpy.mock.calls.at(-1)?.[2]).toMatchObject({
        mode: "light",
        theme: { current: "light" },
      });
    });

    document.documentElement.dataset.theme = "dark";
    document.documentElement.style.setProperty("--bg", "#191817");
    window.dispatchEvent(new CustomEvent("papercusp:theme-changed"));
    await waitFor(() => {
      expect(previewSpy.mock.calls.at(-1)?.[2]).toMatchObject({
        mode: "dark",
        theme: { current: "dark" },
      });
    });

    delete document.documentElement.dataset.theme;
    document.documentElement.style.setProperty("--bg", "#f4f0e8");
    window.dispatchEvent(new CustomEvent("papercusp:theme-changed"));
    await waitFor(() => {
      expect(previewSpy.mock.calls.at(-1)?.[2]).toMatchObject({
        mode: "light",
        theme: { current: "light" },
      });
    });
  });

  it("renders a labeled keyboard outline, enriches P/D targets, and marks the active location", async () => {
    previewSpy.mockImplementation(async (root: HTMLElement) => {
      root.innerHTML = [
        '<h2 id="Phase">Phase</h2>',
        "<ul><li><strong>P-001</strong> First item</li>",
        "<li><strong>P-006</strong> Outline item</li></ul>",
        '<h3 id="D-002---Keep-it-shared">D-002 — Keep it shared</h3>',
      ].join("");
    });
    outlineSpy.mockImplementation(
      (_preview: HTMLElement, outline: HTMLElement) => {
        outline.innerHTML = [
          "<ul>",
          '<li><span data-target-id="Phase"><span>Phase</span></span></li>',
          '<li><span data-target-id="Decisions"><span>Decisions</span></span>',
          '<ul><li><span data-target-id="D-002---Keep-it-shared"><span>D-002 — Keep it shared</span></span></li></ul>',
          "</li>",
          "</ul>",
        ].join("");
      },
    );

    render(
      <PlanDocumentView
        value="# Plan"
        items={[
          { id: "P-001", text: "First item" },
          { id: "P-006", text: "Outline item" },
        ]}
        outline="left"
        showJump={false}
        showFrontmatter={false}
      />,
    );

    const navigation = await screen.findByRole("navigation", {
      name: "Plan outline",
    });
    await waitFor(() =>
      expect(navigation.querySelectorAll("[data-target-id]").length).toBe(5),
    );
    const phase = navigation.querySelector<HTMLElement>(
      '[data-target-id="Phase"]',
    )!;
    const item = navigation.querySelector<HTMLElement>(
      '[data-target-id="P-006"]',
    )!;
    const decision = navigation.querySelector<HTMLElement>(
      '[data-target-id="D-002---Keep-it-shared"]',
    )!;
    expect(phase.dataset.planOutlineKind).toBe("section");
    expect(item.dataset.planOutlineKind).toBe("item");
    expect(decision.dataset.planOutlineKind).toBe("decision");
    expect(item.tabIndex).toBe(0);

    const itemDestination = document.querySelector<HTMLElement>(
      '[data-plan-item="P-006"]',
    )!;
    itemDestination.scrollIntoView = vi.fn();
    fireEvent.keyDown(item, { key: "Enter" });
    expect(itemDestination.scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "smooth",
    });
    expect(item.getAttribute("aria-current")).toBe("location");

    const decisionDestination = document.querySelector<HTMLElement>(
      "#D-002---Keep-it-shared",
    )!;
    decisionDestination.scrollIntoView = vi.fn();
    fireEvent.click(decision.querySelector("span")!);
    expect(decisionDestination.scrollIntoView).toHaveBeenCalledWith({
      block: "start",
      behavior: "smooth",
    });
    expect(decision.getAttribute("aria-current")).toBe("location");
    expect(item.hasAttribute("aria-current")).toBe(false);

    const styles = Array.from(document.querySelectorAll("style"))
      .map((element) => element.textContent ?? "")
      .join("\n");
    expect(styles).toContain("[data-plan-outline-kind='item']");
    expect(styles).toContain(":focus-visible");
    expect(styles).toContain("[aria-current='location']");
    expect(styles).toContain(
      ".pc-plan-document { container-type: inline-size;",
    );
    expect(styles).toContain("@container (max-width: 680px)");
  });

  it('falls back to readable raw text when Vditor fails', async () => {
    previewSpy.mockRejectedValueOnce(new Error('chunk unavailable'));
    render(
      <PlanDocumentView
        value="# Still readable"
        outline={false}
        showJump={false}
        showFrontmatter={false}
      />,
    );
    expect((await screen.findByRole('status')).textContent).toContain('showing raw text');
    expect(screen.getByText('# Still readable')).toBeTruthy();
  });
});
