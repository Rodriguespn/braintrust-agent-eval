---
"@vercel/agent-eval": patch
---

Also fixed `init` command to dynamically use the current package version (matching create-next-app pattern) instead of hardcoded "^0.0.1" in the generated package.json.
