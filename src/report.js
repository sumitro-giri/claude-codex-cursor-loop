import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function buildRunFacts({ runId, target, dir, isRepo, branch, iterations, gateStatus, verdict, verifierFindings, outcome, maxIterations, gateRetries }) {
  return {
    runId, target, dir, isRepo, branch,
    model: { executor: 'gpt-5.6-sol', executorEffort: 'xhigh', verifier: 'cursor-grok-4.5-high' },
    limits: { maxIterations, gateRetries },
    iterations, gateStatus, verdict,
    verifierFindings: verifierFindings ?? null,
    outcome,
  };
}

export function writeReport({ dir, facts }) {
  const jsonPath = join(dir, 'ccc-runfacts.json');
  const mdPath = join(dir, 'ccc-report.md');
  writeFileSync(jsonPath, JSON.stringify(facts, null, 2));
  const last = facts.iterations.at(-1) ?? {};
  const md = [
    `# CCC run ${facts.runId}`,
    ``,
    `- **Outcome:** ${facts.outcome}`,
    `- **Gate:** ${facts.gateStatus}`,
    `- **Verdict:** ${facts.verdict ?? 'n/a'}`,
    `- **Branch:** ${facts.branch}`,
    `- **Iterations:** ${facts.iterations.length}`,
    ``,
    `## What changed`,
    (last.changedFiles ?? []).map((f) => `- ${f}`).join('\n') || '- (nothing)',
    ``,
    `## Why / reasoning`,
    last.lastMessage ?? '(no executor message)',
    ``,
    `## Verifier findings`,
    facts.verifierFindings || '(none recorded)',
    ``,
  ].join('\n');
  writeFileSync(mdPath, md);
  return { jsonPath, mdPath };
}
