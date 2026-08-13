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

test('verifier findings reach both the facts and the markdown report', () => {
  const withFindings = buildRunFacts({
    runId: 'r2', target: 'C:/proj', dir: 'C:/ccc/w', isRepo: false, branch: 'ccc/r2',
    iterations: [{ n: 1, changedFiles: ['a.py'], lastMessage: 'did it',
      gate: { passed: true, results: [] },
      verifier: { verdict: 'ISSUES', findings: 'Line 4 drops the error.' } }],
    gateStatus: 'passed', verdict: 'ISSUES',
    verifierFindings: 'Line 4 drops the error.',
    outcome: 'review-ready', maxIterations: 3, gateRetries: 2,
  });
  assert.equal(withFindings.verifierFindings, 'Line 4 drops the error.');

  const d = mkdtempSync(join(tmpdir(), 'rep2-'));
  const { mdPath } = writeReport({ dir: d, facts: withFindings });
  const md = readFileSync(mdPath, 'utf8');
  assert.match(md, /## Verifier findings/);
  assert.match(md, /Line 4 drops the error/);
});

test('facts carry an explicit null when no findings were recorded', () => {
  assert.equal(facts.verifierFindings, null);
});
