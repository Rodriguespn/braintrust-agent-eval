# @vercel/agent-eval

## 0.0.12

### Patch Changes

- [#18](https://github.com/vercel-labs/agent-eval/pull/18) [`85bfb21`](https://github.com/vercel-labs/agent-eval/commit/85bfb21b5491d66de5905163250121854ef93504) Thanks [@paoloricciuti](https://github.com/paoloricciuti)! - feat: add `editPrompt` config to experiment

## 0.0.11

### Patch Changes

- [`558abe5`](https://github.com/vercel-labs/agent-eval/commit/558abe59602b05e1c353fd5cd64ee5437de4b8a3) Thanks [@paoloricciuti](https://github.com/paoloricciuti)! - feat: accept array of models in experiment #10

## 0.0.10

### Patch Changes

- [#13](https://github.com/vercel-labs/agent-eval/pull/13) [`bb3c09b`](https://github.com/vercel-labs/agent-eval/commit/bb3c09bf5ded138ee693ed7b1e73486f40e947d6) Thanks [@allenzhou101](https://github.com/allenzhou101)! - Add observability (o11y) module for transcript parsing and analysis

  - Normalized transcript parsing for Claude Code, Codex, and OpenCode agents
  - Summary statistics: tool calls, files read/modified, shell commands, errors
  - Save parsed transcript as `transcript.json` and raw as `transcript-raw.jsonl`
  - Include `o11y` summary and `transcriptRawPath` in `result.json`
  - Export `parseTranscript`, `loadTranscript`, `SUPPORTED_AGENTS` from public API
  - Fix Codex agent `wire_api` config and transcript capture on failure
