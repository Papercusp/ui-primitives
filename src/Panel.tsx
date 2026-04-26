'use client';

import { ReactNode } from 'react';

interface PanelProps {
  title: string;
  count?: number | string;
  actions?: ReactNode;
  children: ReactNode;
  padded?: boolean;
  className?: string;
}

export function Panel({ title, count, actions, children, padded, className = '' }: PanelProps) {
  return (
    <div className={`h-panel ${className}`}>
      <div className="h-panel-head">
        <span className="h-panel-title">{title}</span>
        {count !== undefined && <span className="h-panel-count">· {count}</span>}
        {actions && <div className="h-panel-actions">{actions}</div>}
      </div>
      <div className={`h-panel-body${padded ? ' padded' : ''}`}>
        {children}
      </div>
    </div>
  );
}
