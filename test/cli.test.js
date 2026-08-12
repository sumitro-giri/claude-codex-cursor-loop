import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawnCapture } from '../src/spawn.js';

const cli = fileURLToPath(new URL('../bin/loop.js', import.meta.url));

test('exit code 2 and coded reason on preflight failure (missing target)', async () => {
  const r = await spawnCapture(process.execPath,
    [cli, 'run', '--task', 'x', '--target', 'C:/nope/xyz', '--gate', 'C:/nope/g.json']);
  assert.equal(r.code, 2);
  assert.match(r.stdout + r.stderr, /target/i);
});

test('unknown command exits non-zero', async () => {
  const r = await spawnCapture(process.execPath, [cli, 'frobnicate']);
  assert.notEqual(r.code, 0);
});
