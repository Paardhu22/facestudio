// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { runHealthChecks } from '@server/health';

describe('runHealthChecks', () => {
  it('reports sqlite and sharp as working in this Node runtime', async () => {
    const report = await runHealthChecks();
    expect(report).toEqual({ ok: true, checks: { sqlite: true, sharp: true } });
  });
});
