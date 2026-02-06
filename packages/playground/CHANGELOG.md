# @vercel/agent-eval-playground

## 0.0.3

### Patch Changes

- [`6425d0a`](https://github.com/vercel-labs/agent-eval/commit/6425d0acb4e6e4bcb5f95d34001e1e369a7484ab) Thanks [@allenzhou101](https://github.com/allenzhou101)! - Fix build error caused by invalid `shadcn/tailwind.css` import in globals.css. The import has been removed as all styles are already inlined in the file.

## 0.0.2

### Patch Changes

- [#25](https://github.com/vercel-labs/agent-eval/pull/25) [`4228d3c`](https://github.com/vercel-labs/agent-eval/commit/4228d3c50b8a09d4434c5969335a9d397daaba2b) Thanks [@allenzhou101](https://github.com/allenzhou101)! - Fix React version conflicts when running playground via npx. The playground now builds during publish and runs in production mode (`next start`) instead of development mode (`next dev`), eliminating "Invalid hook call" errors caused by multiple React instances.
