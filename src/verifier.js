import { spawnCapture } from './spawn.js';

const FORBIDDEN = ['--force', '--yolo', '-f', '--approve-mcps'];

export function assertNoForbiddenFlags(args) {
  for (const f of FORBIDDEN) {
    if (args.includes(f)) throw new Error(`forbidden verifier flag: ${f}`);
  }
}

const DEFAULT_PROMPT = 'Read the file CHANGES.diff in the current directory and review that change for correctness and obvious bugs. If there are no blocking problems, make your final line exactly NO_BLOCKERS. Otherwise briefly list the problems and make your final line exactly ISSUES.';

export function assertUsablePrompt(prompt) {
  if (prompt.includes('"')) throw new Error('verifier prompt must not contain a double quote');
  if (/[\r\n]/.test(prompt)) throw new Error('verifier prompt must be a single line');
  if (prompt.trim() === '') throw new Error('verifier prompt must not be empty');
}

export function buildCursorArgs({ model = 'cursor-grok-4.5-high', prompt = DEFAULT_PROMPT } = {}) {
  assertUsablePrompt(prompt);
  // --trust clears Cursor's "Workspace Trust Required" gate for READING the checkout; without
  // it the agent exits 1 with no output and every review defaults to fail-safe ISSUES. It is
  // NOT one of the forbidden flags (--force/--yolo/-f/--approve-mcps auto-APPROVE actions);
  // --mode plan keeps the agent read-only regardless. Verified live (exit 0, NO_BLOCKERS).
  const args = ['-p', prompt, '--output-format', 'stream-json', '--mode', 'plan', '--trust', '--model', model];
  assertNoForbiddenFlags(args);
  return args;
}

// The prompt asks the verifier to "briefly list the problems", so an ISSUES verdict
// carries reasoning worth keeping. parseVerdict answers only "may I treat this as
// clean?"; this returns that answer AND the text it was derived from.
export function parseVerdictDetail(streamText) {
  let resultText = null;
  let lastAssistant = '';
  for (const line of streamText.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    let item;
    try { item = JSON.parse(s); } catch { continue; }
    if (item.type === 'assistant' && item.message && Array.isArray(item.message.content)) {
      for (const part of item.message.content) {
        if (part && part.type === 'text' && typeof part.text === 'string') lastAssistant = part.text;
      }
    } else if (item.type === 'result' && typeof item.result === 'string') {
      resultText = item.is_error ? '' : item.result; // an errored result yields no verdict text
    }
  }
  const text = resultText ?? lastAssistant;
  return { verdict: /NO_BLOCKERS/.test(text) ? 'NO_BLOCKERS' : 'ISSUES', text };
}

export function parseVerdict(streamText) {
  return parseVerdictDetail(streamText).verdict;
}

export function hasVerdictEvidence(streamText) {
  for (const line of streamText.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    let item;
    try { item = JSON.parse(s); } catch { continue; }
    if (item.type === 'result' || item.type === 'assistant') return true;
  }
  return false;
}

// Cap on retained review text. Long enough for a real list of findings, short
// enough that ccc-runfacts.json stays readable.
export const FINDINGS_LIMIT = 4000;

export async function runVerifier({ cwd, bin = 'agent', prompt = DEFAULT_PROMPT, extraArgv = [] }) {
  const args = [...extraArgv, ...buildCursorArgs({ prompt })];
  const r = await spawnCapture(bin, args, { cwd });
  const { verdict, text } = parseVerdictDetail(r.stdout);
  const exitCode = r.code;
  const launchFailed = exitCode !== 0 && !hasVerdictEvidence(r.stdout);
  // A verdict without its reasoning is not actionable: report the findings on the
  // path where the verifier actually ran, mirroring how stderr is kept when it did not.
  return launchFailed
    ? { verdict, exitCode, launchFailed, stderr: r.stderr.slice(0, 500) }
    : { verdict, exitCode, launchFailed, findings: text.trim().slice(0, FINDINGS_LIMIT) };
}
