---
'@vercel/agent-eval': patch
---

Fix transcript parsing for Codex and OpenCode agents

**Codex:**
- Added support for `item.started` and `item.completed` event types from OpenAI Responses API
- Now properly parses `reasoning` items as thinking blocks
- Now properly parses `command_execution` items as shell tool calls with exit codes
- Now properly parses `agent_message` items as assistant messages
- Fixed critical bug in `command_execution` success logic: changed from OR (`||`) to AND (`&&`) so commands with non-zero exit codes are correctly marked as failed even when status is "completed"
- Transcript parsing now correctly reports turn counts, tool calls, thinking blocks, and shell command results

**OpenCode:**
- Fixed exit code checking for bash commands - now correctly marks commands with non-zero exit codes as failed
- Shell commands with exit code 127 (command not found) now properly show `success: false` instead of `success: true`

**Playground:**
- Updated shell command display to check `success` field first, then fall back to exit code
- Added tooltip showing exit code on hover for shell commands

Both parsers are model-agnostic and work consistently across all model variants using their respective APIs.
