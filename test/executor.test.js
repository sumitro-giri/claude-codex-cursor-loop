import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildCodexArgs, runExecutor, parseCodexStream } from '../src/executor.js';

const fakeCodex = fileURLToPath(new URL('../fixtures/fake-codex.mjs', import.meta.url));
const schemaSamplePath = fileURLToPath(new URL('../fixtures/codex-stream-schema-sample.ndjson', import.meta.url));

test('buildCodexArgs pins model, effort, disables MCP, workspace-write', () => {
  const a = buildCodexArgs({ cwd: 'C:/w' }).join(' ');
  assert.match(a, /exec/);
  assert.match(a, /--json/);
  assert.match(a, /-m gpt-5\.6-sol/);
  assert.match(a, /model_reasoning_effort=xhigh/);
  assert.match(a, /mcp_servers=\{\}/);
  assert.match(a, /-s workspace-write/);
  assert.doesNotMatch(a, /--ignore-user-config/, 'must never discard project trust');
});

test('runExecutor parses file_change and agent_message from the stream', async () => {
  const r = await runExecutor({ plan: 'do the thing', cwd: process.cwd(),
    bin: process.execPath, extraArgv: [fakeCodex] });
  assert.deepEqual(r.changedFiles, ['a.py', 'b.py']);
  assert.equal(r.lastMessage, 'implemented the thing');
});

test('parseCodexStream handles the real wrapped item.completed schema, ignores errors and item.started', () => {
  const sample = readFileSync(schemaSamplePath, 'utf8');
  const r = parseCodexStream(sample);
  assert.deepEqual(r.changedFiles, ['ok.txt']);
  assert.equal(r.lastMessage, 'Created ok.txt.');
});
