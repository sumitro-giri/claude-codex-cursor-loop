import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isolate } from './isolation.js';
import { runExecutor as realExecutor } from './executor.js';
import { runGate as realGate } from './gate.js';
import { runVerifier as realVerifier } from './verifier.js';
import { buildRunFacts, writeReport } from './report.js';
import { spawnCapture } from './spawn.js';

export async function diffText(dir) {
  // Stage first so NEW (untracked) files appear — `git diff HEAD` alone omits them.
  const add = await spawnCapture('git', ['-C', dir, 'add', '-A']);
  if (add.code !== 0) throw new Error(`git add failed in ${dir}: ${add.stderr.trim()}`);
  const r = await spawnCapture('git', ['-C', dir, 'diff', '--cached', 'HEAD']);
  if (r.code !== 0) throw new Error(`git diff failed in ${dir}: ${r.stderr.trim()}`);
  return r.stdout;
}

export async function run(opts) {
  const {
    task, target, gate, maxIterations, gateRetries, scratchRoot, runId,
    adapters = {},
  } = opts;
  const runExecutor = adapters.runExecutor ?? realExecutor;
  const runGate = adapters.runGate ?? realGate;
  const runVerifier = adapters.runVerifier ?? realVerifier;
  const plan = task.endsWith('.md') ? readFileSync(task, 'utf8') : task;
  const commands = Array.isArray(gate) ? gate : JSON.parse(readFileSync(gate, 'utf8'));

  const iso = await isolate({ target, runId, scratchRoot });
  const iterations = [];
  let gateStatus = 'failed';
  let verdict = null;
  let outcome = 'gate-failed';

  for (let n = 1; n <= maxIterations; n++) {
    let exec = await runExecutor({ plan, cwd: iso.dir });
    // Free gate retries: rerun executor up to gateRetries times without consuming an iteration.
    let gateResult = await runGate({ commands, cwd: iso.dir });
    let retries = 0;
    while (!gateResult.passed && retries < gateRetries) {
      exec = await runExecutor({ plan, cwd: iso.dir });
      gateResult = await runGate({ commands, cwd: iso.dir });
      retries++;
    }
    const iter = { n, changedFiles: exec.changedFiles, lastMessage: exec.lastMessage,
      gate: gateResult, verifier: null };

    if (!gateResult.passed) {
      gateStatus = 'failed'; outcome = 'gate-failed';
      iterations.push(iter);
      break;
    }
    gateStatus = 'passed';

    const diff = await diffText(iso.dir);
    if (diff.trim() === '') {
      outcome = 'no-op';
      iterations.push(iter);
      break;
    }

    writeFileSync(join(iso.dir, 'CHANGES.diff'), diff);

    const v = await runVerifier({ cwd: iso.dir });
    iter.verifier = v;
    verdict = v.verdict;
    iterations.push(iter);
    outcome = v.launchFailed ? 'verifier-failed' : 'review-ready';
    break; // one checkpoint: hand back to the controller after the first reviewed pass
  }

  const verifierFindings = iterations.at(-1)?.verifier?.findings ?? null;
  const facts = buildRunFacts({ runId, target, dir: iso.dir, isRepo: iso.isRepo,
    branch: iso.branch, iterations, gateStatus, verdict, verifierFindings, outcome,
    maxIterations, gateRetries });
  writeReport({ dir: iso.dir, facts });
  return facts;
}
