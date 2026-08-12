import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRunFacts, writeReport } from '../src/report.js';

const facts = buildRunFacts({
  runId: 'r1', target: 'C:/proj', dir: 'C:/ccc/w', isRepo: false, branch: 'ccc/r1',
  iterations: [{ n: 1, changedFiles: ['a.py'], lastMessage: 'did it',
    gate: { passed: true, results: [] }, verifier: { verdict: 'NO_BLOCKERS' } }],
  gateStatus: 'passed', verdict: 'NO_BLOCKERS', outcome: 'review-ready',
  maxIterations: 3, gateRetries: 2,
});

test('buildRunFacts records pins and outcome', () => {
  assert.equal(facts.model.executor, 'gpt-5.6-sol');
  assert.equal(facts.model.executorEffort, 'xhigh');
  assert.equal(facts.model.verifier, 'cursor-grok-4.5-high');
  assert.equal(facts.outcome, 'review-ready');
  assert.equal(facts.iterations[0].changedFiles[0], 'a.py');
  assert.equal(facts.limits.maxIterations, 3);
  assert.equal(facts.limits.gateRetries, 2);
});

test('writeReport emits json and markdown', () => {
  const d = mkdtempSync(join(tmpdir(), 'rep-'));
  const { jsonPath, mdPath } = writeReport({ dir: d, facts });
  assert.deepEqual(JSON.parse(readFileSync(jsonPath, 'utf8')).runId, 'r1');
  assert.match(readFileSync(mdPath, 'utf8'), /review-ready/);
});
