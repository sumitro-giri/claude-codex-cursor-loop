import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGate } from '../src/gate.js';

const ok = { bin: process.execPath, args: ['-e', 'process.exit(0)'] };
const bad = { bin: process.execPath, args: ['-e', 'process.exit(1)'] };

test('all-zero commands pass', async () => {
  const r = await runGate({ commands: [ok, ok], cwd: process.cwd() });
  assert.equal(r.passed, true);
  assert.equal(r.results.length, 2);
});

test('a non-zero command fails the gate and short-circuits', async () => {
  const r = await runGate({ commands: [ok, bad, ok], cwd: process.cwd() });
  assert.equal(r.passed, false);
  assert.equal(r.results.length, 2, 'stops at the first failure');
  assert.equal(r.results[1].code, 1);
});

test('an empty command list passes vacuously', async () => {
  const r = await runGate({ commands: [], cwd: process.cwd() });
  assert.equal(r.passed, true);
});
