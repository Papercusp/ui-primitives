'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';

/** Minimal plan-item shape needed by the shared read surface. */
export interface PlanDocumentItem {
  id: string;
  text?: string;
  storedStatus?: string;
  effectiveStatus?: string;
}

/** Minimal decision shape needed by jump search. */
export interface PlanDocumentDecision {
  id: string;
  title?: string;
}

export interface PlanDocumentCandidate {
  id: string;
  label: string;
  hint: string;
  kind: 'item' | 'decision';
}

export interface PlanDocumentViewProps {
  /** Complete plan markdown. Leading frontmatter is stripped when metadata is supplied. */
  value: string;
  slug?: string;
  frontmatter?: Record<string, unknown>;
  items?: readonly PlanDocumentItem[];
  decisions?: readonly PlanDocumentDecision[];
  outline?: 'left' | 'right' | false;
  /** The host may already render these controls around the document. */
  showJump?: boolean;
  showFrontmatter?: boolean;
  /** Root-relative Vditor runtime mirror. Must be supplied by the host app. */
  assetBaseUrl?: string;
  theme?: 'dark' | 'light';
  className?: string;
  style?: CSSProperties;
  /** Host-specific decorators run after the shared plan decorations. */
  onParsed?: (root: HTMLElement) => void;
}

const STATUS_TOKEN_RE = /^(todo|wip|blocked|needs-human|done|dropped)$/;
const PLAN_ID_RE = /^[PD]-\d{3,}$/;
const PLAN_REF_RE = /\b([PD]-\d{3,})\b/g;
const MAX_JUMP_HITS = 8;

export const PLANTUML_NEUTRALIZED_CLASS = 'language-plantuml-neutralized';

/**
 * Vditor's PlantUML adapter posts diagram source to plantuml.com. Its transform
 * hook runs first, so rename the selector the adapter searches for and fail
 * closed while keeping the source readable as a code block.
 */
export function neutralizePlanDocumentPlantuml(html: string): string {
  return html.replace(/language-plantuml(?![\w-])/g, PLANTUML_NEUTRALIZED_CLASS);
}

/** Expand Obsidian-style wiki links without coupling the viewer to a router. */
export function expandPlanDocumentWikiLinks(markdown: string): string {
  return (markdown ?? '').replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (_match, raw, label) => {
    const requested = String(raw).trim();
    const slash = requested.indexOf('/');
    const harness = slash > 0 ? requested.slice(0, slash) : null;
    const target = slash > 0 ? requested.slice(slash + 1) : requested;
    const params = new URLSearchParams({ target });
    if (harness) params.set('harness', harness);
    return `[${String(label ?? requested).trim()}](/wiki?${params.toString()})`;
  });
}

/** Remove one leading YAML frontmatter block from canonical plan markdown. */
export function stripPlanFrontmatter(source: string): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  return match ? source.slice(match[0].length) : source;
}

/** Decorate Vditor output with status pills, item anchors, badges, and refs. */
export function decoratePlanDocumentDom(
  root: HTMLElement,
  items: readonly PlanDocumentItem[] | undefined,
): void {
  const byId = new Map<string, PlanDocumentItem>();
  for (const item of items ?? []) byId.set(item.id, item);

  for (const code of Array.from(root.querySelectorAll<HTMLElement>('code'))) {
    if (code.dataset.planStatus || code.closest('pre')) continue;
    const status = (code.textContent ?? '').trim();
    if (!STATUS_TOKEN_RE.test(status)) continue;
    code.dataset.planStatus = status;
    code.classList.add('pc-plan-status', `pc-plan-status--${status}`);
  }

  for (const itemElement of Array.from(root.querySelectorAll<HTMLElement>('li'))) {
    if (itemElement.dataset.planItem) continue;
    const firstStrong =
      itemElement.querySelector<HTMLElement>(':scope > strong') ??
      itemElement.querySelector<HTMLElement>(':scope > p > strong');
    if (!firstStrong) continue;
    const id = (firstStrong.textContent ?? '').trim();
    if (!PLAN_ID_RE.test(id)) continue;
    itemElement.dataset.planItem = id;

    const item = byId.get(id);
    if (
      !item?.storedStatus ||
      !item.effectiveStatus ||
      item.effectiveStatus === item.storedStatus
    ) {
      continue;
    }
    const statusCode = itemElement.querySelector<HTMLElement>(
      `code[data-plan-status="${item.storedStatus}"]`,
    );
    const anchor = statusCode ?? firstStrong;
    if (anchor.nextElementSibling?.classList.contains('pc-plan-badge')) continue;
    const badge = document.createElement('sup');
    badge.className = `pc-plan-badge pc-plan-badge--${item.effectiveStatus}`;
    badge.textContent = item.effectiveStatus;
    badge.title = `effective: ${item.effectiveStatus} (stored: ${item.storedStatus})`;
    anchor.after(badge);
  }

  wrapPlanDocumentRefs(root);
}

function wrapPlanDocumentRefs(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || parent.closest('a, code, pre, .pc-plan-ref')) {
        return NodeFilter.FILTER_REJECT;
      }
      if (
        parent.tagName === 'STRONG' &&
        parent.parentElement?.closest('li[data-plan-item]')
      ) {
        return NodeFilter.FILTER_REJECT;
      }
      PLAN_REF_RE.lastIndex = 0;
      const hit = PLAN_REF_RE.test(node.nodeValue ?? '');
      PLAN_REF_RE.lastIndex = 0;
      return hit ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  const targets: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    targets.push(node as Text);
  }

  for (const text of targets) {
    const value = text.nodeValue ?? '';
    PLAN_REF_RE.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = PLAN_REF_RE.exec(value)) !== null) {
      if (match.index > last) {
        fragment.appendChild(document.createTextNode(value.slice(last, match.index)));
      }
      const id = match[1] ?? '';
      const anchor = document.createElement('a');
      anchor.className = 'pc-plan-ref';
      anchor.dataset.planRef = id;
      anchor.textContent = id;
      anchor.href = `#${id}`;
      fragment.appendChild(anchor);
      last = match.index + match[0].length;
    }
    if (last < value.length) fragment.appendChild(document.createTextNode(value.slice(last)));
    text.replaceWith(fragment);
  }
}

export function findPlanDocumentHeading(scope: HTMLElement, id: string): HTMLElement | null {
  for (const heading of Array.from(scope.querySelectorAll<HTMLElement>('h3'))) {
    if ((heading.textContent ?? '').trim().startsWith(id)) return heading;
  }
  return null;
}

/** Scroll to a P-NNN item or D-NNN decision and briefly highlight it. */
export function scrollPlanDocumentTarget(scope: HTMLElement | null, id: string): boolean {
  if (!scope || !PLAN_ID_RE.test(id)) return false;
  const destination = id.startsWith('P-')
    ? scope.querySelector<HTMLElement>(`[data-plan-item="${id}"]`)
    : scope.querySelector<HTMLElement>(`#${id}`) ?? findPlanDocumentHeading(scope, id);
  if (!destination) return false;
  destination.scrollIntoView({ block: 'center', behavior: 'smooth' });
  destination.classList.add('pc-plan-highlight');
  globalThis.setTimeout(() => destination.classList.remove('pc-plan-highlight'), 1500);
  return true;
}

/** Install one delegated click listener for all rendered P-NNN/D-NNN refs. */
export function attachPlanDocumentRefClickHandler(root: HTMLElement): () => void {
  const handler = (event: Event) => {
    const anchor = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-plan-ref]');
    const id = anchor?.dataset.planRef;
    if (!id) return;
    event.preventDefault();
    scrollPlanDocumentTarget(root, id);
  };
  root.addEventListener('click', handler);
  return () => root.removeEventListener('click', handler);
}

/** Exact ID, then ID prefix, then ID/text substring; capped for a compact list. */
export function rankPlanDocumentCandidates(
  candidates: readonly PlanDocumentCandidate[],
  query: string,
): PlanDocumentCandidate[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  const exact: PlanDocumentCandidate[] = [];
  const prefix: PlanDocumentCandidate[] = [];
  const substring: PlanDocumentCandidate[] = [];
  for (const candidate of candidates) {
    const id = candidate.id.toLowerCase();
    const hint = candidate.hint.toLowerCase();
    if (id === normalized) exact.push(candidate);
    else if (id.startsWith(normalized)) prefix.push(candidate);
    else if (id.includes(normalized) || hint.includes(normalized)) substring.push(candidate);
  }
  return [...exact, ...prefix, ...substring].slice(0, MAX_JUMP_HITS);
}

export function PlanDocumentJump({
  items,
  decisions,
  scopeRef,
}: {
  items?: readonly PlanDocumentItem[];
  decisions?: readonly PlanDocumentDecision[];
  scopeRef: RefObject<HTMLElement | null>;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const candidates = useMemo<PlanDocumentCandidate[]>(() => [
    ...(items ?? []).map((item) => ({
      id: item.id,
      label: item.id,
      hint: item.text ?? '',
      kind: 'item' as const,
    })),
    ...(decisions ?? []).map((decision) => ({
      id: decision.id,
      label: decision.id,
      hint: decision.title ?? '',
      kind: 'decision' as const,
    })),
  ], [items, decisions]);
  const hits = useMemo(
    () => rankPlanDocumentCandidates(candidates, query),
    [candidates, query],
  );

  useEffect(() => setActive(0), [query]);

  const jumpTo = useCallback((id: string) => {
    if (!scrollPlanDocumentTarget(scopeRef.current, id)) return;
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  }, [scopeRef]);

  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setQuery('');
      setOpen(false);
      return;
    }
    if (!hits.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => (index + 1) % hits.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => (index - 1 + hits.length) % hits.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const hit = hits[active] ?? hits[0];
      if (hit) jumpTo(hit.id);
    }
  }, [active, hits, jumpTo]);

  const expanded = open && hits.length > 0;
  return (
    <div className="pc-jump" data-open={expanded ? 'true' : 'false'}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        className="pc-jump__input"
        placeholder={candidates.length ? 'Jump to P-001, decision, or item text…' : 'No items in this plan'}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => globalThis.setTimeout(() => setOpen(false), 120)}
        onKeyDown={handleKeyDown}
        disabled={!candidates.length}
        aria-label="Jump to item"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={expanded ? `${listId}-${active}` : undefined}
        aria-autocomplete="list"
      />
      {expanded ? (
        <ul id={listId} className="pc-jump__hits" role="listbox">
          {hits.map((hit, index) => (
            <li
              id={`${listId}-${index}`}
              key={`${hit.kind}-${hit.id}`}
              className={`pc-jump__hit ${index === active ? 'is-active' : ''}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => {
                event.preventDefault();
                jumpTo(hit.id);
              }}
              onMouseEnter={() => setActive(index)}
            >
              <span className={`pc-jump__id pc-jump__id--${hit.kind}`}>{hit.label}</span>
              <span className="pc-jump__hint">{hit.hint}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function formatFrontmatterScalar(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) {
    const iso = value.toISOString();
    return /T00:00:00\.000Z$/.test(iso) ? iso.slice(0, 10) : iso;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const text = String(value).trim();
    return text || null;
  }
  if (Array.isArray(value)) {
    const parts = value.map(formatFrontmatterScalar).filter((part): part is string => part !== null);
    return parts.length ? parts.join(', ') : null;
  }
  return null;
}

/** Compact metadata card shared by full plan-document readers. */
export function PlanDocumentFrontmatter({
  slug,
  frontmatter,
}: {
  slug?: string;
  frontmatter: Record<string, unknown>;
}) {
  const rows: Array<[string, string]> = [];
  const add = (label: string, value: unknown) => {
    const formatted = formatFrontmatterScalar(value);
    if (formatted !== null) rows.push([label, formatted]);
  };
  add('slug', frontmatter.slug ?? slug);
  add('status', frontmatter.status);
  add('created', frontmatter.created);
  add('updated', frontmatter.updated);
  add('owner', frontmatter.owner);
  for (const key of Object.keys(frontmatter)) {
    if (['title', 'slug', 'status', 'created', 'updated', 'owner'].includes(key)) continue;
    add(key, frontmatter[key]);
  }
  if (!rows.length) return null;
  return (
    <section className="pc-plan-fm" aria-label="Plan metadata">
      <dl className="pc-plan-fm__grid">
        {rows.map(([label, value]) => (
          <div className="pc-plan-fm__row" key={label}>
            <dt className="pc-plan-fm__key">{label}</dt>
            <dd className="pc-plan-fm__val">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

let vditorCssPromise: Promise<unknown> | null = null;
function loadVditorCss(): Promise<unknown> {
  if (!vditorCssPromise) vditorCssPromise = import('vditor/dist/index.css');
  return vditorCssPromise;
}

function PlanDocumentFallback({ value }: { value: string }) {
  return (
    <div className="pc-plan-document__fallback" role="status">
      <p>Couldn&rsquo;t load the plan renderer — showing raw text.</p>
      <pre>{value}</pre>
    </div>
  );
}

/**
 * Complete read-only plan document surface. The host supplies the Vditor asset
 * mirror and styling; the shared component supplies rendering behavior.
 */
export function PlanDocumentView({
  value,
  slug,
  frontmatter,
  items,
  decisions,
  outline = 'left',
  showJump = true,
  showFrontmatter = true,
  assetBaseUrl = '/vditor',
  theme = 'dark',
  className,
  style,
  onParsed,
}: PlanDocumentViewProps) {
  const scopeRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const outlineRef = useRef<HTMLDivElement>(null);
  const onParsedRef = useRef(onParsed);
  onParsedRef.current = onParsed;
  const [loadError, setLoadError] = useState(false);
  const body = frontmatter ? stripPlanFrontmatter(value) : value;

  useEffect(() => {
    if (!previewRef.current) return;
    let cancelled = false;
    let detachRefs = () => {};
    let detachOutline = () => {};
    setLoadError(false);

    (async () => {
      await loadVditorCss();
      const Vditor = (await import('vditor')).default;
      if (cancelled || !previewRef.current) return;
      await Vditor.preview(previewRef.current, expandPlanDocumentWikiLinks(body), {
        cdn: assetBaseUrl,
        transform: neutralizePlanDocumentPlantuml,
        mode: theme,
        theme: { current: theme },
        math: { engine: 'KaTeX' },
        anchor: 1,
        lang: 'en_US',
      } as never);
      if (cancelled || !previewRef.current) return;

      decoratePlanDocumentDom(previewRef.current, items);
      detachRefs = attachPlanDocumentRefClickHandler(previewRef.current);
      try {
        onParsedRef.current?.(previewRef.current);
      } catch {
        // A host decoration cannot make the underlying document unreadable.
      }

      if (outline && outlineRef.current) {
        outlineRef.current.innerHTML = '';
        Vditor.outlineRender(previewRef.current, outlineRef.current);
        const handleOutlineClick = (event: Event) => {
          let target = event.target as HTMLElement | null;
          while (target && target !== outlineRef.current) {
            const targetId = target.getAttribute?.('data-target-id');
            if (targetId) {
              const heading = Array.from(
                previewRef.current?.querySelectorAll<HTMLElement>('[id]') ?? [],
              ).find((element) => element.id === targetId);
              if (heading) {
                event.preventDefault();
                event.stopPropagation();
                heading.scrollIntoView({ block: 'start', behavior: 'smooth' });
              }
              return;
            }
            target = target.parentElement;
          }
        };
        outlineRef.current.addEventListener('click', handleOutlineClick, true);
        detachOutline = () => outlineRef.current?.removeEventListener('click', handleOutlineClick, true);
      }
    })().catch(() => {
      if (!cancelled) setLoadError(true);
    });

    return () => {
      cancelled = true;
      detachRefs();
      detachOutline();
    };
  }, [assetBaseUrl, body, items, outline, theme]);

  const preview = loadError ? (
    <PlanDocumentFallback value={body} />
  ) : (
    <div
      ref={previewRef}
      className="vditor-reset pc-md-preview pc-plan-document__preview"
      style={{ background: theme === 'dark' ? '#19232A' : undefined, color: theme === 'dark' ? '#e6e6e6' : undefined }}
    />
  );

  return (
    <div ref={scopeRef} className={`pc-plan-document ${className ?? ''}`.trim()} style={style}>
      {showJump ? <PlanDocumentJump items={items} decisions={decisions} scopeRef={scopeRef} /> : null}
      {showFrontmatter && frontmatter ? (
        <PlanDocumentFrontmatter slug={slug} frontmatter={frontmatter} />
      ) : null}
      {outline ? (
        <div className="pc-plan-document__body" style={{ display: 'flex', flex: '1 1 auto', minHeight: 0, gap: 16 }}>
          {outline === 'left' ? <div ref={outlineRef} className="pc-md-outline" style={outlinePanelStyle} /> : null}
          {preview}
          {outline === 'right' ? <div ref={outlineRef} className="pc-md-outline" style={outlinePanelStyle} /> : null}
        </div>
      ) : preview}
      <style>{planDocumentCss}</style>
    </div>
  );
}

const outlinePanelStyle: CSSProperties = {
  display: 'block',
  width: 220,
  flexShrink: 0,
  position: 'sticky',
  top: 0,
  alignSelf: 'flex-start',
  maxHeight: '100%',
  overflow: 'auto',
  padding: '8px 4px',
};

const planDocumentCss = `
  .pc-plan-document { display: flex; flex: 1 1 auto; flex-direction: column; min-width: 0; min-height: 0; }
  .pc-plan-document__preview { flex: 1 1 auto; min-width: 0; min-height: 0; }
  .pc-plan-document .pc-md-outline ul { list-style: none; padding-left: 12px; margin: 0; }
  .pc-plan-document .pc-md-outline > ul { padding-left: 0; }
  .pc-plan-document .pc-md-outline li { margin: 2px 0; }
  .pc-plan-document .pc-md-outline a { color: #aaa; text-decoration: none; font-size: 12px; line-height: 1.5; display: block; padding: 1px 4px; border-radius: 2px; }
  .pc-plan-document .pc-md-outline a:hover { color: #fff; background: #232E37; }
  .pc-plan-document__fallback { flex: 1 1 auto; min-width: 0; border: 1px solid var(--border, rgba(125,211,252,.18)); border-radius: 8px; overflow: hidden; }
  .pc-plan-document__fallback p { margin: 0; padding: 8px 12px; color: var(--fg-mute, #7f9bb4); border-bottom: 1px solid var(--border, rgba(125,211,252,.18)); }
  .pc-plan-document__fallback pre { margin: 0; padding: 16px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--fg, #e6e6e6); background: #19232A; font: 13px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .pc-plan-document .pc-md-preview :is(pre, pre code) { background: color-mix(in srgb, var(--bg-popover, #0d1829), transparent 6%) !important; color: var(--fg, #e7f7ff) !important; }
  .pc-plan-document .pc-md-preview pre { border: 1px solid var(--border-strong, rgba(125,211,252,.32)) !important; border-radius: 12px !important; }
  .pc-plan-document .pc-md-preview :is(code.language-yaml, code.language-yml, code.language-frontmatter, pre code:first-child) { color: var(--fg, #e7f7ff) !important; }
  .pc-plan-document .pc-md-preview :is(.hljs-attr, .hljs-attribute, .hljs-keyword, .hljs-meta) { color: var(--accent-strong, #7dd3fc) !important; }
  .pc-plan-document .pc-md-preview :is(.hljs-string, .hljs-literal, .hljs-number) { color: var(--fg-dim, #b9d4e8) !important; }
`;
