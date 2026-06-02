// @restart/ui-primitives — self-contained UI primitives for harness/admin UIs.
//
// Pure peer-dep React components. No internal coupling beyond npm packages.
// Intended for cross-app reuse via git submodule.

export { JsonTree } from './JsonTree';
export { LogView, type LogEvent, type LogTab, type LogViewProps } from './LogView';
export { MarkdownView } from './MarkdownView';
export { Panel } from './Panel';
export { StatCard } from './StatCard';
export { StatusPill, type FeatureStatus } from './StatusPill';

// Theme system — headless [data-theme] switcher + framework-agnostic runtime.
export {
  ThemeSwitcher,
  type ThemeOption,
  type ThemeSwitcherProps,
  useTheme,
  applyTheme,
  getActiveTheme,
  subscribe as subscribeTheme,
  STORAGE_KEY as THEME_STORAGE_KEY,
  THEME_EVENT,
  DEFAULT_THEME,
  PREPAINT_SNIPPET,
} from './theme';
