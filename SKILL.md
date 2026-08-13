---
name: run-claude-codex-cursor-loop
description: Use when you want a lightweight Claude/Codex/Cursor loop — plan → Codex writes in git isolation → free exit-code gate → on-demand Cursor verify → run report — on any Windows folder, git repo or not.
---

# run-claude-codex-cursor-loop (v2, thin)

The controller (this Claude session) authors a plan, then invokes:

    node bin/loop.js run --task <plan.md> --target <folder> --gate <gate.json> [--max-iterations N] [--gate-retries M]

- **Gate config** (`gate.json`): a JSON array of `{ "bin": "...", "args": ["..."] }`; pass/fail is by exit code only.
- Codex writes only inside a git-isolated copy; the real tree is never touched.
- Cursor runs read-only (`--mode plan`) and only when there is a non-empty diff.
- Output: `ccc-runfacts.json` + `ccc-report.md` in the isolated dir, plus a branch + diff to review.
- The command refuses to report success over a red gate. Review the report, then iterate or accept.
- **Outcomes:** `review-ready`, `no-op`, `gate-failed`, or `verifier-failed` when Cursor exits non-zero without producing a result or assistant event.
- **Exit codes:** `0` on review-ready or no-op, `1` on gate-failed, `2` on preflight/arg failure, `3` on an unexpected fatal error or unrecognised outcome, `4` on verifier-failed.
- When the verifier runs, its review text is kept as `verifierFindings` in `ccc-runfacts.json` and printed under **Verifier findings** in `ccc-report.md`. An `ISSUES` verdict without its reasoning is not actionable.
- The Cursor verifier binary is `agent` (the Cursor Agent CLI).

## Iterating

Each `loop run` invocation performs **one pass** (Codex writes → gate → optional Cursor verify → report). Iteration is **controller-driven**: after reviewing the report, if you want another pass, author a correction plan and invoke `loop run` again. `--max-iterations` is accepted and recorded but does not cause `run` to self-loop in v1 — the controller (you) drives correction cycles, one `loop run` per cycle.
