import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run, diffText } from '../src/run.js';

function makeTarget(withFile = true) {
  const d = mkdtempSync(join(tmpdir(), 'tgt-'));
  if (withFile) writeFileSync(join(d, 'seed.txt'), 'seed');
  return d;
}
// Scratch base must satisfy assertSafeScratchRoot: NOT under AppData or OneDrive.
// os.tmpdir() is under AppData on Windows (guard rejects it); mirror the prod default C:\ccc\w.
const SAFE_SCRATCH_BASE = 'C:\\ccc-test';
const scratch = () => {
  mkdirSync(SAFE_SCRATCH_BASE, { recursive: true });
  return mkdtempSync(join(SAFE_SCRATCH_BASE, 's-'));
};

// Executor fake that writes a file into the isolated dir, so the diff is non-empty.
const writingExecutor = async ({ cwd }) => {
  writeFileSync(join(cwd, 'new.txt'), 'content');
  return { changedFiles: ['new.txt'], lastMessage: 'wrote new.txt' };
};
const noopExecutor = async () => ({ changedFiles: [], lastMessage: 'nothing to do' });

test('verifier findings are lifted into the run facts', async () => {
  const scr = scratch();
  const facts = await run({
    task: 'do', target: makeTarget(), gate: [], maxIterations: 1, gateRetries: 2,
    scratchRoot: scr, runId: 'f1',
    adapters: {
      runExecutor: writingExecutor,
      runGate: async () => ({ passed: true, results: [] }),
      runVerifier: async () => ({
        verdict: 'ISSUES', launchFailed: false, findings: 'Line 4 drops the error.',
      }),
    },
  });
  assert.equal(facts.verdict, 'ISSUES');
  assert.equal(facts.verifierFindings, 'Line 4 drops the error.');
  rmSync(scr, { recursive: true, force: true });
});

test('green gate + clean verify → review-ready, verifier launched once', async () => {
  let launches = 0;
  const scr = scratch();
  const facts = await run({
    task: 'do', target: makeTarget(), gate: [], maxIterations: 1, gateRetries: 2,
    scratchRoot: scr, runId: 'g1',
    adapters: {
      runExecutor: writingExecutor,
      runGate: async () => ({ passed: true, results: [] }),
      runVerifier: async () => { launches++; return { verdict: 'NO_BLOCKERS', launchFailed: false }; },
    },
  });
  assert.equal(facts.outcome, 'review-ready');
  assert.equal(launches, 1);
  assert.ok(existsSync(join(facts.dir, 'CHANGES.diff')), 'CHANGES.diff handed to verifier');
  rmSync(scr, { recursive: true, force: true });
});

test('verifier launch failure → verifier-failed with verifier details preserved', async () => {
  const scr = scratch();
  const verifier = { verdict: 'ISSUES', exitCode: 1, launchFailed: true, stderr: 'launch failed' };
  const facts = await run({
    task: 'do', target: makeTarget(), gate: [], maxIterations: 1, gateRetries: 2,
    scratchRoot: scr, runId: 'vf1',
    adapters: {
      runExecutor: writingExecutor,
      runGate: async () => ({ passed: true, results: [] }),
      runVerifier: async () => verifier,
    },
  });
  assert.equal(facts.outcome, 'verifier-failed');
  assert.deepEqual(facts.iterations[0].verifier, verifier);
  rmSync(scr, { recursive: true, force: true });
});

test('empty diff → verifier is NOT launched (no-op)', async () => {
  let launches = 0;
  const scr = scratch();
  const facts = await run({
    task: 'do', target: makeTarget(), gate: [], maxIterations: 1, gateRetries: 2,
    scratchRoot: scr, runId: 'e1',
    adapters: {
      runExecutor: noopExecutor,
      runGate: async () => ({ passed: true, results: [] }),
      runVerifier: async () => { launches++; return { verdict: 'NO_BLOCKERS' }; },
    },
  });
  assert.equal(launches, 0, 'no diff means nothing to review');
  assert.equal(facts.outcome, 'no-op');
  rmSync(scr, { recursive: true, force: true });
});

test('red gate exhausts retries → gate-failed, verifier never launched', async () => {
  let gateCalls = 0, launches = 0;
  const scr = scratch();
  const facts = await run({
    task: 'do', target: makeTarget(), gate: [], maxIterations: 1, gateRetries: 2,
    scratchRoot: scr, runId: 'r1',
    adapters: {
      runExecutor: writingExecutor,
      runGate: async () => { gateCalls++; return { passed: false, results: [{ code: 1 }] }; },
      runVerifier: async () => { launches++; return { verdict: 'NO_BLOCKERS' }; },
    },
  });
  assert.equal(facts.gateStatus, 'failed');
  assert.equal(facts.outcome, 'gate-failed');
  assert.equal(launches, 0);
  assert.equal(gateCalls, 3, '1 initial + 2 free retries');
  rmSync(scr, { recursive: true, force: true });
});

test('diffText throws when git fails (non-git dir)', async () => {
  const d = mkdtempSync(join(tmpdir(), 'nogit-'));
  await assert.rejects(() => diffText(d), /git (add|diff) failed/);
});
