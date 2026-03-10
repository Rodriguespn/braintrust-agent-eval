# @supabase/agent-evals

Test Claude Code on your framework. Measure what actually works.

## Why?

You're building a framework and want Claude Code to work well with it. But how do you know if:
- Your documentation helps agents write correct code?
- Adding an MCP server improves agent success rates?
- Sonnet performs as well as Opus for your use cases?
- Your latest API changes broke agent compatibility?

**This framework gives you answers.** Run controlled experiments, measure pass rates, compare techniques.

## Quick Start

```bash
npm install @supabase/agent-evals
```

Create a dataset that maps eval names to prompts:

```typescript
// src/dataset.ts
export const scenarios = {
  'create-tasks-table': {
    prompt: `Create a tasks table with title, status, and timestamps.
Set up Row Level Security so users can only see their own tasks.`,
  },
  'add-search-index': {
    prompt: 'Add a full-text search index on the posts table content column.',
  },
};
```

Create an eval runner:

```typescript
// my-evals.eval.ts
import { Eval } from 'braintrust';
import { runSingleEval, type EvalFixture } from '@supabase/agent-evals';
import { scenarios } from './src/dataset.js';
import { resolve } from 'path';

Eval('my-project', {
  data: () =>
    Object.entries(scenarios).map(([name, cfg]) => ({
      input: { name, prompt: cfg.prompt },
      expected: null,
    })),
  task: async (input) => {
    const fixture: EvalFixture = {
      name: input.name,
      path: resolve('evals', input.name),
      prompt: input.prompt,
    };
    return runSingleEval(fixture, {
      agent: 'claude-code',
      model: 'claude-sonnet-4-6',
      timeout: 600,
      apiKey: process.env.ANTHROPIC_API_KEY ?? '',
      sandbox: 'docker',
    });
  },
  scores: [],
});
```

Run with:

```bash
ANTHROPIC_API_KEY=sk-ant-... npx braintrust eval my-evals.eval.ts
```

## Creating Evals

Each eval tests one specific task an agent should be able to do with your framework.

### Directory structure

Each eval is a directory under `evals/`. It can contain any files you want the agent to start with — starter code, config files, MCP server definitions, reference docs, etc. The prompt is defined in your dataset, not in a file.

```
evals/
  create-tasks-table/
    .mcp.json           # Optional: MCP server config
    supabase/           # Optional: starter project files
      config.toml
  add-search-index/
    package.json        # Your framework as a dependency
    src/
      schema.ts         # Starter code for the agent
```

If an eval has no starter files, the directory can be empty — the agent works with a blank slate.

### Asserting on agent behavior

Your scorers can assert not just on the files the agent produced, but on *how* it worked — which shell commands it ran, which files it read, how many tool calls it made, etc. The framework automatically parses the agent's transcript and makes it available via `evalRunData.transcript`.

Use `parseTranscript` to extract structured data:

```typescript
import { runSingleEval, parseTranscript } from '@supabase/agent-evals';

const evalRunData = await runSingleEval(fixture, { ... });

const parsed = evalRunData.transcript
  ? parseTranscript(evalRunData.transcript, 'claude-code')
  : null;

const summary = parsed?.summary;
// summary.shellCommands, summary.filesRead, summary.totalToolCalls, etc.
```

The `summary` object is a `TranscriptSummary` with these fields:

| Field | Type | Description |
|-------|------|-------------|
| `shellCommands` | `{ command, exitCode?, success? }[]` | Shell commands the agent ran |
| `filesRead` | `string[]` | Files the agent read |
| `filesModified` | `string[]` | Files the agent wrote or edited |
| `toolCalls` | `Record<ToolName, number>` | Count of each tool type used |
| `totalToolCalls` | `number` | Total tool calls made |
| `webFetches` | `{ url, method?, status?, success? }[]` | Web fetches made |
| `totalTurns` | `number` | Conversation turns |
| `errors` | `string[]` | Errors encountered |
| `thinkingBlocks` | `number` | Thinking/reasoning blocks |

> **Note**: If the agent's transcript is unavailable (e.g. the agent crashed before producing output), `parsed` will be `null`.

## Configuration Reference

### runSingleEval options

```typescript
import { runSingleEval, type EvalFixture } from '@supabase/agent-evals';

const fixture: EvalFixture = {
  name: 'my-eval',
  path: '/absolute/path/to/evals/my-eval',
  prompt: 'Create a Button component...',
};

const result = await runSingleEval(fixture, {
  // Required: which agent to use
  agent: 'claude-code',

  // Model to use
  model: 'claude-sonnet-4-6',

  // Timeout per run in seconds (default: 600)
  timeout: 600,

  // API key for the agent
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',

  // Sandbox backend (default: 'docker')
  sandbox: 'docker',

  // Setup function for sandbox pre-configuration
  setup: async (sandbox) => {
    await sandbox.writeFiles({ '.env': 'API_KEY=test' });
    await sandbox.runCommand('npm', ['run', 'setup']);
  },

  // Rewrite the prompt before running
  editPrompt: (prompt) => `Use the skill.\n\n${prompt}`,
});
```

### ExperimentConfig (batch runner)

```typescript
import type { ExperimentConfig } from '@supabase/agent-evals';

const config: ExperimentConfig = {
  // Required: which agent to use
  agent: 'claude-code',

  // Model to use (defaults vary by agent)
  // Provide an array to run the same experiment across multiple models.
  model: 'opus',

  // How many times to run each eval (default: 1)
  runs: 10,

  // Stop after first success? (default: true)
  earlyExit: false,

  // npm scripts that must pass after agent finishes (default: [])
  scripts: ['build', 'lint'],

  // Timeout per run in seconds (default: 600)
  timeout: 600,

  // Filter which evals to run (default: '*' for all)
  evals: '*',
  // evals: ['specific-eval'],
  // evals: (name) => name.startsWith('api-'),

  // Setup function for sandbox pre-configuration
  setup: async (sandbox) => {
    await sandbox.writeFiles({ '.env': 'API_KEY=test' });
    await sandbox.runCommand('npm', ['run', 'setup']);
  },

  // Rewrite the prompt before running
  editPrompt: (prompt) => `Use the skill.\n\n${prompt}`,

  // Copy project files to results directory (default: 'none')
  // 'none' - don't copy files
  // 'changed' - copy only files modified by the agent
  // 'all' - copy the entire project including original fixture files
  copyFiles: 'changed',
};
```

## A/B Testing

The real power is comparing different approaches. Create multiple dataset entries or separate eval runs:

```typescript
// control: no MCP
const controlFixture: EvalFixture = { name, path, prompt };
const controlResult = await runSingleEval(controlFixture, {
  agent: 'claude-code',
  model: 'claude-sonnet-4-6',
  apiKey,
});

// treatment: with MCP server
const treatmentResult = await runSingleEval(treatmentFixture, {
  agent: 'claude-code',
  model: 'claude-sonnet-4-6',
  apiKey,
  setup: async (sandbox) => {
    await sandbox.writeFiles({
      '.claude/settings.json': JSON.stringify({
        mcpServers: { myframework: { command: 'myframework-mcp' } }
      })
    });
  },
});
```

Common comparisons:

| Experiment | Control | Treatment |
|------------|---------|-----------|
| MCP impact | No MCP | With MCP server |
| Model comparison | Haiku | Sonnet / Opus |
| Documentation | Minimal docs | Rich examples |
| System prompt | Default | Framework-specific |
| Tool availability | Read/write only | + custom tools |

## Results

`runSingleEval` returns an `EvalRunData` object:

```typescript
const result = await runSingleEval(fixture, options);

result.result.status;    // 'passed' | 'failed'
result.result.duration;  // seconds
result.transcript;       // raw JSONL transcript string
result.generatedFiles;   // Record<path, content> of files in the sandbox
```

### File Copying

Use the `copyFiles` config option to capture files generated by the agent:

```typescript
const result = await runSingleEval(fixture, {
  copyFiles: 'changed',  // or 'all' or 'none' (default)
});

result.generatedFiles; // files modified/created by the agent
```

**Options:**

- **`none`** (default) — Don't copy any project files
- **`changed`** — Copy only files that were modified, created, or deleted by the agent
- **`all`** — Copy the complete project including both the original fixture files and agent changes

## Failure Classification

When evals fail, the framework optionally classifies each failure as one of:

- **model** -- the agent tried but wrote incorrect code
- **infra** -- infrastructure broke (API errors, rate limits, crashes)
- **timeout** -- the run hit its time limit

Classification uses Claude Sonnet 4.5 via the Anthropic API. This requires `ANTHROPIC_API_KEY` to be set.

## Environment Variables

| Variable             | Required | Description                              |
|----------------------|----------|------------------------------------------|
| `ANTHROPIC_API_KEY`  | Yes      | Anthropic API key for Claude Code and the failure classifier |

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

## Tips

**Use multiple runs**: Single runs don't tell you reliability. Run each eval multiple times and measure pass rates for meaningful data.

**Isolate variables**: Change one thing at a time between experiments. Don't compare "Opus with MCP" to "Haiku without MCP".

**Test incrementally**: Start with simple tasks, add complexity as you learn what works.

**Use setup for context**: The `setup` function is where you install MCP servers, write reference files, or configure the sandbox before the agent runs.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow and release process.

## License

MIT
