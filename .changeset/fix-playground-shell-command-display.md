---
'@vercel/agent-eval-playground': patch
---

Fix shell command success/failure display

- Updated shell command badges to check `success` field first, then fall back to `exitCode === 0`
- Added tooltip showing exit code on hover
- Commands with non-zero exit codes now correctly display in red (destructive variant)
