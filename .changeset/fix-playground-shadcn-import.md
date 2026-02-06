---
"@vercel/agent-eval-playground": patch
---

Fix build error caused by invalid `shadcn/tailwind.css` import in globals.css. The import has been removed as all styles are already inlined in the file.
