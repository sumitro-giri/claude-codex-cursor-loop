# run-claude-codex-cursor-loop

A three-seat agent loop for [Claude Code](https://claude.ai/code): **Claude plans, Codex
writes, Cursor reviews** — with the write step confined to a git-isolated copy and a gate
that decides pass/fail by exit code, not by an LLM's opinion.

One `loop run` is one pass:

```
plan.md ──► Codex writes (isolated copy) ──► gate (exit codes) ──► Cursor verifies (read-only) ──► report
```

Your target folder is never modified. Work lands on a branch in an isolated copy, and you
review a diff.

## Why this shape

Three separate failure modes get three separate seats:

- **Codex writes but cannot mark its own homework.** It never decides whether it succeeded.
- **The gate is the only thing that can pass a change.** It runs your commands and reads
  exit codes. An agent cannot argue with a non-zero exit.
- **Cursor reviews read-only** (`--mode plan`), and only when there is a non-empty diff.
  Write flags are asserted absent, not merely omitted.

The loop refuses to report success over a red gate. If the verifier fails to launch, that is
reported as `verifier-failed` — never silently downgraded to a review verdict.

## Requirements

| Requirement | Why | Check |
|---|---|---|
| **Node ≥ 24** | runtime | `node --version` |
| **git** | isolation (worktree / init) | `git --version` |
| **Codex CLI** | executor seat | `codex --version` |
| **Cursor Agent CLI** | verifier seat | `agent --version` |
| **Claude Code** | controller seat | — |

The Cursor binary is **`agent`**, not `cursor-agent`.

**No credentials are stored or passed by this package.** Each CLI authenticates itself on
your machine with your own subscription, and cost follows those subscriptions. Nothing is
billed through this skill.

Windows is the primary, fully-exercised target. macOS and Linux should work — pure Node,
POSIX `which`, plain `spawn` — but treat the first Unix run as verification.

## Install

```
node install.mjs
```

Copies the payload to `~/.claude/skills/run-claude-codex-cursor-loop`, verifies **every file
by SHA-256**, runs the test suite **from the installed location**, and reports whether `git`,
`codex`, and `agent` are on PATH. Non-zero exit means it did not install cleanly.

Options: `--dry-run` (preview, writes nothing), `--name <x>` (install under a different name
to run side-by-side with an existing copy).

## Usage

```
node bin/loop.js run --task <plan.md> --target <folder> --gate <gate.json> [--max-iterations N] [--gate-retries M]
```

| Option | Required | Default | Range |
|---|---|---|---|
| `--task` | yes | — | path to a markdown plan |
| `--target` | yes | — | folder to work on, git repo or not |
| `--gate` | yes | — | path to gate config |
| `--max-iterations` | no | 3 | 1–10 |
| `--gate-retries` | no | 2 | 0–3 |

`gate.json` is a JSON array of commands; **pass/fail is by exit code only**:

```json
[
  { "bin": "npm", "args": ["test"] },
  { "bin": "npx", "args": ["tsc", "--noEmit"] }
]
```

### Outcomes and exit codes

| Outcome | Meaning | Exit |
|---|---|---|
| `review-ready` | gate green, diff produced, verdict recorded | 0 |
| `no-op` | executor changed nothing | 0 |
| `gate-failed` | a gate command exited non-zero | 1 |
| `verifier-failed` | Cursor exited non-zero with no result or assistant event | 3 |
| — | preflight or argument failure | 2 |

Each run writes `ccc-runfacts.json` and `ccc-report.md` into the isolated directory, plus a
branch and a diff to review.

### Iterating

Iteration is **controller-driven**. `--max-iterations` is recorded but `run` does not
self-loop: read the report, then author a correction plan and invoke `loop run` again — one
invocation per correction cycle.

## Smoke test

A `plan.md` saying *"create hello.txt containing HELLO WORLD"*, this `gate.json`:

```json
[{ "bin": "node", "args": ["-e", "process.exit(require('fs').existsSync('hello.txt')?0:1)"] }]
```

and any throwaway folder as `--target`. Expect `outcome: review-ready`, `gateStatus: passed`,
and a verdict.

## Configuration

- **Scratch root** defaults to `C:/ccc/w` on Windows and `~/.ccc/w` elsewhere. Override with
  `CCC_SCRATCH_ROOT`.
- The scratch root must **not** sit under `AppData` or `OneDrive`. This is enforced, not
  advisory — AppData is MSIX-redirected under a packaged host, and OneDrive syncs mid-write
  and lengthens paths past Windows limits.
- Models are pinned in `src/report.js`: executor `gpt-5.6-sol` at `xhigh` effort, verifier
  `cursor-grok-4.5-high`.

## Known gotchas

- **Cursor needs `--trust`** to clear its workspace-trust gate. Without it, it exits 1 with
  empty output and every review silently falls back to `ISSUES`. Already on the launch line.
- **Never pass `--ignore-user-config` to Codex.** It discards the project trust registry and
  Codex silently goes read-only — it appears to work and writes nothing.
- **`where codex` may list an extensionless npm shim first.** Handled: the resolver prefers a
  PATHEXT-executable variant.

## Development

```
node --test
```

48 tests, zero runtime dependencies, no build step. `fixtures/` holds real captured
`codex` and `cursor-agent` NDJSON streams so the parsers are tested against actual vendor
output rather than invented shapes.

See [PORTING.md](PORTING.md) for moving this to another machine.

## License

MIT — see [LICENSE](LICENSE).
