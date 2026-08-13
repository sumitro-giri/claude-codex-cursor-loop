import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  assertNoForbiddenFlags,
  assertUsablePrompt,
  buildCursorArgs,
  hasVerdictEvidence,
  parseVerdict,
  parseVerdictDetail,
  runVerifier,
  FINDINGS_LIMIT,
} from '../src/verifier.js';

const fakeAgent = fileURLToPath(new URL('../fixtures/fake-agent.mjs', import.meta.url));
const brokenFakeAgent = fileURLToPath(new URL('../fixtures/fake-agent-broken.mjs', import.meta.url));
const realSamplePath = fileURLToPath(new URL('../fixtures/cursor-stream-schema-sample.ndjson', import.meta.url));

test('parseVerdictDetail keeps the review text, not just the verdict', () => {
  const stream = JSON.stringify({
    type: 'result', subtype: 'success', is_error: false,
    result: 'Line 4 drops the error. ISSUES',
  }) + '\n';
  const { verdict, text } = parseVerdictDetail(stream);
  assert.equal(verdict, 'ISSUES');
  assert.match(text, /Line 4 drops the error/);
});

test('parseVerdict still returns a bare verdict string', () => {
  assert.equal(typeof parseVerdict('{"type":"result","result":"NO_BLOCKERS"}'), 'string');
});

test('runVerifier reports findings on the path where the verifier ran', async () => {
  const r = await runVerifier({ cwd: process.cwd(), bin: process.execPath, extraArgv: [fakeAgent] });
  assert.equal(r.verdict, 'ISSUES');
  assert.equal(r.launchFailed, false);
  // The reasoning must survive: a verdict alone is not actionable.
  assert.match(r.findings, /a bug on line 4/);
});

test('runVerifier findings are capped', async () => {
  const r = await runVerifier({ cwd: process.cwd(), bin: process.execPath, extraArgv: [fakeAgent] });
  assert.ok(r.findings.length <= FINDINGS_LIMIT);
});

test('a failed launch reports stderr and carries no findings', async () => {
  const r = await runVerifier({ cwd: process.cwd(), bin: process.execPath, extraArgv: [brokenFakeAgent] });
  assert.equal(r.launchFailed, true);
  assert.equal(r.findings, undefined);
});

test('assertUsablePrompt accepts a usable prompt', () => {
  assert.doesNotThrow(() => assertUsablePrompt('review the diff'));
});

test('assertUsablePrompt rejects double quotes', () => {
  assert.throws(() => assertUsablePrompt('say "hi"'), /double quote/);
});

test('assertUsablePrompt rejects newlines', () => {
  assert.throws(() => assertUsablePrompt('line one\nline two'), /single line/);
});

test('assertUsablePrompt rejects an empty prompt', () => {
  assert.throws(() => assertUsablePrompt('   '), /empty/);
});

test('buildCursorArgs uses read-only plan mode, trust, and the pinned model', () => {
  const a = buildCursorArgs({}).join(' ');
  assert.match(a, /--mode plan/);
  assert.match(a, /--output-format stream-json/);
  assert.match(a, /--trust/, 'must clear the workspace-trust gate or every review fails to ISSUES');
  assert.match(a, /cursor-grok-4\.5-high/);
});

test('forbidden write flags never appear', () => {
  assert.doesNotMatch(buildCursorArgs({}).join(' '), /--force|--yolo|(^| )-f( |$)|--approve-mcps/);
});

test('buildCursorArgs rejects a quote-bearing prompt', () => {
  assert.throws(() => buildCursorArgs({ prompt: 'has "quotes"' }), /double quote/);
});

test('assertNoForbiddenFlags throws on a write flag', () => {
  assert.throws(() => assertNoForbiddenFlags(['-p', '--force']), /force/);
});

test('runVerifier returns NO_BLOCKERS when the stream says so', async () => {
  const r = await runVerifier({ cwd: process.cwd(), bin: process.execPath,
    extraArgv: [fakeAgent, 'clean'] });
  assert.equal(r.verdict, 'NO_BLOCKERS');
  assert.equal(r.launchFailed, false);
});

test('runVerifier identifies a non-zero empty stream as a launch failure', async () => {
  const r = await runVerifier({ cwd: process.cwd(), bin: process.execPath,
    extraArgv: [brokenFakeAgent] });
  assert.equal(r.verdict, 'ISSUES');
  assert.equal(r.launchFailed, true);
  assert.notEqual(r.exitCode, 0);
  assert.match(r.stderr, /fake agent failed/);
});

test('runVerifier returns ISSUES otherwise', async () => {
  const r = await runVerifier({ cwd: process.cwd(), bin: process.execPath,
    extraArgv: [fakeAgent, 'dirty'] });
  assert.equal(r.verdict, 'ISSUES');
});

test('parseVerdict handles the real captured cursor-agent stream without crashing', () => {
  const streamText = readFileSync(realSamplePath, 'utf8');
  const verdict = parseVerdict(streamText);
  assert.ok(verdict === 'NO_BLOCKERS' || verdict === 'ISSUES');
  // The sample is a FILEOK probe with no NO_BLOCKERS token, proving the parser
  // reads the real nested assistant/result shape rather than crashing or false-matching.
  assert.equal(verdict, 'ISSUES');
});

test('parseVerdict returns NO_BLOCKERS from a real-shaped result string', () => {
  const streamText = [
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'checking...' }] } }),
    JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'All clear. NO_BLOCKERS' }),
  ].join('\n');
  assert.equal(parseVerdict(streamText), 'NO_BLOCKERS');
});

test('parseVerdict is fail-safe: an errored result yields ISSUES even if text contains NO_BLOCKERS', () => {
  const streamText = [
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'NO_BLOCKERS' }] } }),
    JSON.stringify({ type: 'result', subtype: 'error', is_error: true, result: 'NO_BLOCKERS' }),
  ].join('\n');
  assert.equal(parseVerdict(streamText), 'ISSUES');
});

test('hasVerdictEvidence detects result or assistant stream events', () => {
  assert.equal(hasVerdictEvidence(''), false);
  assert.equal(hasVerdictEvidence('{"type":"result","result":"x"}'), true);
});
