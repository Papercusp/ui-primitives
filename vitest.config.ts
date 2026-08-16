import { defineConfig } from 'vitest/config';

// WI-4973: standalone config — a clone of this package's own repo
// (github.com/Papercusp/ui-primitives) has no sibling `libs/test-config` (a
// Papercusp-monorepo-private package), so this can no longer route through
// `@papercusp/test-config`'s `defineVitestConfig`. jsdom globally (not every
// test file here carries a per-file `// @vitest-environment jsdom` pragma —
// e.g. a11y.test.tsx relies on the config default) + the automatic JSX
// runtime (components omit `import React`).
export default defineConfig({
  test: {
    environment: 'jsdom',
    exclude: ['node_modules', 'dist'],
    testTimeout: 15_000,
  },
  esbuild: { jsx: 'automatic' },
});
