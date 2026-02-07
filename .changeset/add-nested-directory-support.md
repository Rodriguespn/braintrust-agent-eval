---
"@vercel/agent-eval": minor
"@vercel/agent-eval-playground": minor
---

Add support for nested eval directories. You can now organize evals into folders and use glob patterns to filter them:

```
evals/
  vercel-cli/
    deploy/
    link/
  flags/
    create/
    update/
```

Filter examples in experiment config:
- `evals: 'vercel-cli/*'` - Run all vercel-cli evals
- `evals: ['vercel-cli/*', 'flags/*']` - Run multiple categories
- `evals: '*/deploy'` - Run all deploy evals across folders
- `evals: 'vercel-cli/deploy'` - Run specific nested eval

Results automatically maintain the hierarchy (e.g., `results/experiment/.../vercel-cli/deploy/`).
