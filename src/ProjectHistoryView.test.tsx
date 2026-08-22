import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProjectHistoryView, type BuildHistoryPlan } from './ProjectHistoryView';

const plan: BuildHistoryPlan = {
  slug: 'demo-history', title: 'Demo history', status: 'active', updatedAt: '2026-08-21T00:00:00Z',
  contentHash: 'a'.repeat(64), markdown: '# Demo history', frontmatter: {}, decisions: [], completedItems: [],
  project: { id: 'demo', name: 'Demo', repository: null },
  snapshot: { kind: 'papercusp-plan-export', workspace: 'w', harness: 'demo', planPrefix: null, generatedAt: '2026-08-21T00:00:00Z', planCount: 1, generator: 'test' },
  validationSummary: { total: 1, passed: 1, failed: 0, validating: 0, todo: 0, requiringTest: 1 },
  items: [{
    id: 'P-001', text: 'Ship it', storedStatus: 'done', effectiveStatus: 'done', importance: 'high', riskTier: null,
    authority: null, blockedBy: [], phase: 'Build', lineNumber: 4,
    validationAssertions: [{
      id: 'VAL-demo-001', planItemId: 'P-001', verify: 'The page renders.', evidenceLocator: 'history.test.tsx',
      status: 'passed', requiresTest: true, source: 'canonical-plan-inline', sourceLineNumber: 5,
    }],
  }],
};

describe('ProjectHistoryView validation contract', () => {
  it('renders assertion status, proof locator, owner item, and canonical provenance', () => {
    const html = renderToStaticMarkup(<ProjectHistoryView plans={[plan]} initialTarget={{ plan: plan.slug, item: null }} now={new Date('2026-08-21T01:00:00Z')} />);
    expect(html).toContain('1/1 assertions passed');
    expect(html).toContain('VAL-demo-001');
    expect(html).toContain('The page renders.');
    expect(html).toContain('history.test.tsx');
    expect(html).toContain('P-001');
    expect(html).toContain('Canonical plan · line 5');
  });
});
