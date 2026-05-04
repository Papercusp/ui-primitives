'use client';

import { ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2 } from 'lucide-react';

interface PanelProps {
  title: string;
  count?: number | string;
  actions?: ReactNode;
  children: ReactNode;
  padded?: boolean;
  className?: string;
  /**
   * When true, render a maximize/minimize toggle in the panel header.
   * Maximize portals the panel to document.body and pins it via fixed
   * positioning over the whole viewport. Minimize button + ESC restore it.
   * Defaults to true; pass false on panels that already have a custom
   * fullscreen affordance or shouldn't be maximizable.
   */
  maximizable?: boolean;
}

export function Panel({
  title, count, actions, children, padded, className = '', maximizable = true,
}: PanelProps) {
  const [maximized, setMaximized] = useState(false);
  const reactId = useId();
  // Sanitize for view-transition-name (must be a CSS ident).
  const vtName = `pc-panel-${reactId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Wrap state changes in startViewTransition for a smooth shared-element
  // morph between the in-grid position and the fullscreen overlay. Falls
  // back to a plain setState on browsers without View Transitions API.
  const toggle = useCallback(() => {
    const next = !maximized;
    try {
      const sv = (document as any).startViewTransition?.bind(document);
      if (sv) {
        sv(() => { setMaximized(next); });
        return;
      }
    } catch { /* fall through to direct setState */ }
    setMaximized(next);
  }, [maximized]);

  // ESC closes when maximized.
  useEffect(() => {
    if (!maximized) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [maximized, toggle]);

  // Lock body scroll while maximized so the underlying page doesn't scroll
  // behind the overlay.
  useEffect(() => {
    if (!maximized || typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [maximized]);

  const head = (
    <div className="h-panel-head">
      <span className="h-panel-title">{title}</span>
      {count !== undefined && <span className="h-panel-count">· {count}</span>}
      {actions && <div className="h-panel-actions">{actions}</div>}
    </div>
  );

  const body = (
    <div className={`h-panel-body${padded ? ' padded' : ''}`}>
      {children}
    </div>
  );

  // Maximize button is positioned absolutely on the panel root rather
  // than inside the head, because some panels (e.g. Feature queue) hide
  // their head via CSS and use an inline toolbar instead. Top-right
  // corner keeps it visible no matter which layout the panel uses.
  const maximizeBtn = maximizable ? (
    <button
      type="button"
      className="h-panel-maximize"
      onClick={toggle}
      aria-label={maximized ? `Restore ${title}` : `Maximize ${title}`}
      title={maximized ? `Restore (Esc)` : `Maximize`}
    >
      {maximized ? <Minimize2 size={13} aria-hidden="true" /> : <Maximize2 size={13} aria-hidden="true" />}
    </button>
  ) : null;

  // The single-element morph approach: render the panel in its normal
  // place when not maximized, OR portal it to body when maximized. The
  // view-transition-name + startViewTransition does the rest.
  const panelStyle: React.CSSProperties = { viewTransitionName: vtName };

  if (maximized && typeof document !== 'undefined') {
    return (
      <>
        {/* Placeholder keeps the grid slot from collapsing. Same outer
            classes so layout columns stay stable. */}
        <div className={`h-panel h-panel-placeholder ${className}`} aria-hidden="true" />
        {createPortal(
          <div
            ref={panelRef}
            className={`h-panel h-panel-maximized ${className}`}
            style={panelStyle}
            role="dialog"
            aria-modal="true"
            aria-label={`${title} (maximized)`}
          >
            {head}
            {body}
            {maximizeBtn}
          </div>,
          document.body
        )}
      </>
    );
  }

  return (
    <div ref={panelRef} className={`h-panel ${className}`} style={panelStyle}>
      {head}
      {body}
      {maximizeBtn}
    </div>
  );
}
