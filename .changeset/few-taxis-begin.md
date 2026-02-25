---
"@vercel/agent-eval": patch
---

Wire Vercel Sandbox auth to use `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, and `VERCEL_PROJECT_ID` from env vars when all are present, so CI can authenticate with access tokens instead of requiring OIDC context.
