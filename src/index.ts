// @papercusp/ui-primitives — self-contained, domain-agnostic UI primitives.
//
// Pure peer-dep React components. No internal coupling beyond npm packages.
// Intended for cross-app reuse via git submodule.

export { JsonTree } from './JsonTree';
export { LogView, type LogEvent, type LogTab, type LogViewProps, type AppLinkConfig } from './LogView';
export { MarkdownView } from './MarkdownView';
export { Panel } from './Panel';
export { StatCard } from './StatCard';
export { StatusPill, type FeatureStatus } from './StatusPill';

// The "workspace default vs session override" primitive (isOverridden /
// effectiveValue / <OverridableSetting>) lives in the dedicated './override'
// subpath, NOT this top-level barrel — importing it must not drag in the heavy
// peer deps (react-markdown, react-virtuoso, anser) the components above pull.
// Consumers import from '@papercusp/ui-primitives/override'. Lifted out of
// apps/operator-vite in sentinel-herald P-035 so both operator apps share ONE copy.
