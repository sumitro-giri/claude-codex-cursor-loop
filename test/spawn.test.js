import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawnCapture, commandExists } from '../src/spawn.js';

test('captures stdout and exit code 0', async () => {
  const r = await spawnCapture(process.execPath, ['-e', 'process.stdout.write("hi")']);
  assert.equal(r.code, 0);
  assert.equal(r.stdout, 'hi');
});

test('captures a non-zero exit code without throwing', async () => {
  const r = await spawnCapture(process.execPath, ['-e', 'process.exit(3)']);
  assert.equal(r.code, 3);
});

test('feeds stdin when input is provided', async () => {
  const r = await spawnCapture(process.execPath,
    ['-e', 'process.stdin.pipe(process.stdout)'], { input: 'echoed' });
  assert.equal(r.stdout, 'echoed');
});

test('rejects when the binary does not exist', async () => {
  await assert.rejects(() => spawnCapture('definitely-not-a-real-binary-xyz', []));
});

test('commandExists is true for node, false for nonsense', async () => {
  assert.equal(await commandExists(process.execPath), true);
  assert.equal(await commandExists('definitely-not-a-real-binary-xyz'), false);
});

test('captures multi-byte UTF-8 output without corruption', async () => {
  const s = 'café ☕ 🚀 日本語';
  const r = await spawnCapture(process.execPath, ['-e', `process.stdout.write(${JSON.stringify(s)})`]);
  assert.equal(r.stdout, s);
});

test('runs a .cmd on Windows and preserves space-bearing args', { skip: process.platform !== 'win32' }, async () => {
  const cmd = fileURLToPath(new URL('../fixtures/echoargs.cmd', import.meta.url));
  const r = await spawnCapture(cmd, ['hello', 'a b c']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /ARG=\[hello\]/);
  assert.match(r.stdout, /ARG=\[a b c\]/, 'space-bearing arg must survive as one arg');
});
