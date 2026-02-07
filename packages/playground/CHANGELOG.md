# @vercel/agent-eval-playground

## 0.1.0

### Minor Changes

- [#30](https://github.com/vercel-labs/agent-eval/pull/30) [`a61c89e`](https://github.com/vercel-labs/agent-eval/commit/a61c89e371bb9b459e448360cd9c8572c37eecc4) Thanks [@allenzhou101](https://github.com/allenzhou101)! - Add support for nested eval directories. You can now organize evals into folders and use glob patterns to filter them:

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

## 0.0.5

### Patch Changes

- [`6159d01`](https://github.com/vercel-labs/agent-eval/commit/6159d01b6e2a064bfb4abd8006b7797c553c58f2) Thanks [@allenzhou101](https://github.com/allenzhou101)! - Run playground in production mode (`next start`) instead of dev mode (`next dev`) to fix React version conflicts and "Cannot read properties of null (reading 'useInsertionEffect')" errors when running via npx.

## 0.0.4

### Patch Changes

- [`23e2d43`](https://github.com/vercel-labs/agent-eval/commit/23e2d439e6cead7939633dcf753c5c8f29f7892a) Thanks [@allenzhou101](https://github.com/allenzhou101)! - Add repository field to package.json to fix npm provenance verification error during publishing.

## 0.0.3

### Patch Changes

- [`6425d0a`](https://github.com/vercel-labs/agent-eval/commit/6425d0acb4e6e4bcb5f95d34001e1e369a7484ab) Thanks [@allenzhou101](https://github.com/allenzhou101)! - Fix build error caused by invalid `shadcn/tailwind.css` import in globals.css. The import has been removed as all styles are already inlined in the file.

## 0.0.2

### Patch Changes

- [#25](https://github.com/vercel-labs/agent-eval/pull/25) [`4228d3c`](https://github.com/vercel-labs/agent-eval/commit/4228d3c50b8a09d4434c5969335a9d397daaba2b) Thanks [@allenzhou101](https://github.com/allenzhou101)! - Fix React version conflicts when running playground via npx. The playground now builds during publish and runs in production mode (`next start`) instead of development mode (`next dev`), eliminating "Invalid hook call" errors caused by multiple React instances.
