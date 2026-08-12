import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnCapture } from '../src/spawn.js';
import { assertSafeScratchRoot, hashTree, isolate } from '../src/isolation.js';

// Scratch base must satisfy assertSafeScratchRoot: NOT under AppData or OneDrive.
// os.tmpdir() is under AppData on Windows (guard rejects it); mirror the prod default C:\ccc\w.
const SAFE_SCRATCH_BASE = 'C:\\ccc-test';
function makeScratch() {
  mkdirSync(SAFE_SCRATCH_BASE, { recursive: true });
  return mkdtempSync(join(SAFE_SCRATCH_BASE, 's-'));
}

test('assertSafeScratchRoot rejects AppData and OneDrive', () => {
  assert.throws(() => assertSafeScratchRoot('C:/Users/x/AppData/Local/ccc'), /AppData/i);
  assert.throws(() => assertSafeScratchRoot('C:/Users/x/OneDrive/ccc'), /OneDrive/i);
  assert.doesNotThrow(() => assertSafeScratchRoot('C:/ccc/w'));
  assert.doesNotThrow(() => assertSafeScratchRoot('C:/x/onedriverback/ccc'));
  assert.throws(() => assertSafeScratchRoot('C:/Users/x/OneDrive - Acme Corp/ccc'), /OneDrive/i);
});

test('hashTree changes when a file changes, ignores .git', () => {
  const d = mkdtempSync(join(tmpdir(), 'ht-'));
  writeFileSync(join(d, 'a.txt'), 'one');
  const h1 = hashTree(d);
  mkdirSync(join(d, '.git'));
  writeFileSync(join(d, '.git', 'junk'), 'x');
  assert.equal(hashTree(d), h1, '.git must not affect the hash');
  writeFileSync(join(d, 'a.txt'), 'two');
  assert.notEqual(hashTree(d), h1);
});

test('isolate on a NON-repo folder inits git and leaves the source untouched', async () => {
  const src = mkdtempSync(join(tmpdir(), 'src-'));
  writeFileSync(join(src, 'file.txt'), 'hello');
  const before = hashTree(src);
  const scratch = makeScratch();
  const iso = await isolate({ target: src, runId: 'testrun', scratchRoot: scratch });
  assert.equal(iso.isRepo, false);
  assert.ok(existsSync(join(iso.dir, '.git')), 'isolated dir is a git repo');
  assert.ok(existsSync(join(iso.dir, 'file.txt')), 'content copied');
  assert.equal(hashTree(src), before, 'source tree unchanged');
  const log = await spawnCapture('git', ['-C', iso.dir, 'log', '--oneline']);
  assert.match(log.stdout, /baseline/i);
  await iso.cleanup();
  rmSync(scratch, { recursive: true, force: true });
});

test('isolate on a git repo creates a worktree and leaves the source untouched', async () => {
  const src = mkdtempSync(join(tmpdir(), 'repo-'));
  writeFileSync(join(src, 'f.txt'), 'x');
  await spawnCapture('git', ['-C', src, 'init', '-b', 'main']);
  await spawnCapture('git', ['-C', src, '-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A']);
  await spawnCapture('git', ['-C', src, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'init']);
  const before = hashTree(src);
  const scratch = makeScratch();
  const iso = await isolate({ target: src, runId: 'repotest', scratchRoot: scratch });
  assert.equal(iso.isRepo, true);
  assert.ok(existsSync(join(iso.dir, 'f.txt')), 'worktree has the file');
  assert.equal(iso.branch, 'ccc/repotest');
  assert.equal(hashTree(src), before, 'source tree unchanged');
  await iso.cleanup();
  rmSync(scratch, { recursive: true, force: true });
});
