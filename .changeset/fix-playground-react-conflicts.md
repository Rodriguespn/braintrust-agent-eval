---
"@vercel/agent-eval-playground": patch
---

Fix React version conflicts when running playground via npx. The playground now builds during publish and runs in production mode (`next start`) instead of development mode (`next dev`), eliminating "Invalid hook call" errors caused by multiple React instances.
