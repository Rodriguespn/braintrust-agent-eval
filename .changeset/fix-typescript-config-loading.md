---
"@vercel/agent-eval": patch
---

Fix TypeScript config file loading by adding jiti support. Previously, running `npx @vercel/agent-eval <experiment>` with a TypeScript config file would fail with "Unknown file extension .ts" error. The CLI now properly loads both .ts and .js config files.
