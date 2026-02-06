# @vercel/agent-eval-playground

## 0.0.2

### Patch Changes

- [#25](https://github.com/vercel-labs/agent-eval/pull/25) [`4228d3c`](https://github.com/vercel-labs/agent-eval/commit/4228d3c50b8a09d4434c5969335a9d397daaba2b) Thanks [@allenzhou101](https://github.com/allenzhou101)! - Fix React version conflicts when running playground via npx. The playground now builds during publish and runs in production mode (`next start`) instead of development mode (`next dev`), eliminating "Invalid hook call" errors caused by multiple React instances.
