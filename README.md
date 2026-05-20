# @restart/ui-primitives

Self-contained UI primitives for harness/admin UIs:

- `JsonTree` — collapsible JSON viewer (react-json-view-lite based)
- `LogView` — virtualized ANSI-colored log viewer (react-virtuoso + anser)
- `MarkdownView` — markdown renderer (react-markdown + remark-gfm)
- `Panel` — generic panel container with title/actions slots
- `StatCard` — stat display with label + value + optional sub
- `StatusPill` — colored status badge (icon + label)

## Repos using this lib

- `papercupai/papercup` — main monorepo (admin harness UI)
- `papercupai/papercup-public-site` — papercupai.com (public harness mirror)

Both consume this lib via git submodule at `libs/ui-primitives/`.

## Peer deps

Host app must provide: `react`, plus the runtime deps listed in `peerDependencies`.
