import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../src/args.js';

test('parses a full run invocation', () => {
  const r = parseArgs(['run', '--task', 'plan.md', '--target', 'C:/proj',
    '--gate', 'gate.json', '--max-iterations', '3', '--gate-retries', '1']);
  assert.equal(r.command, 'run');
  assert.equal(r.task, 'plan.md');
  assert.equal(r.target, 'C:/proj');
  assert.equal(r.gate, 'gate.json');
  assert.equal(r.maxIterations, 3);
  assert.equal(r.gateRetries, 1);
});

test('applies defaults for iterations and retries', () => {
  const r = parseArgs(['run', '--task', 'p', '--target', 't', '--gate', 'g']);
  assert.equal(r.maxIterations, 3);
  assert.equal(r.gateRetries, 2);
});

test('rejects an unknown command', () => {
  assert.throws(() => parseArgs(['frobnicate']), /unknown command/i);
});

test('rejects a missing required option', () => {
  assert.throws(() => parseArgs(['run', '--task', 'p']), /--target/);
});
