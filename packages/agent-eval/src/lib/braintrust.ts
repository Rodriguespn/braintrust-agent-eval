/**
 * Braintrust integration for running agent evals.
 *
 * Replaces the Vitest-in-Docker EVAL.ts pattern with host-side assertions:
 * - The agent runs in Docker and its generated files are captured
 * - Each fixture's EVAL.ts exports a `check(files)` function called on the host
 * - Results are logged as Braintrust experiments
 *
 * Usage:
 *   npx braintrust eval experiments/braintrust.eval.ts
 */

import { Eval } from 'braintrust';
import { createJiti } from 'jiti';
import { join } from 'path';
import type { ExperimentConfig, EvalFixture, EvalRunData } from './types.js';
import { resolveConfig } from './config.js';
import { loadAllFixtures } from './fixture.js';
import { runSingleEval } from './runner.js';

/** Check function exported from a fixture's EVAL.ts */
export type EvalCheckFn = (files: Record<string, string>) => boolean | Promise<boolean>;

export interface BraintrustEvalOptions {
  /** Braintrust project name (must exist in your Braintrust account) */
  projectName: string;
  /** Absolute path to the directory containing eval fixtures */
  evalsDir: string;
  /** Experiment configuration (same as ExperimentConfig, single model only) */
  config: ExperimentConfig;
  /** Anthropic API key. Defaults to process.env.ANTHROPIC_API_KEY */
  apiKey?: string;
}

/**
 * Register a Braintrust eval that:
 * 1. Loads fixtures from `evalsDir`
 * 2. Runs the agent on each fixture in Docker
 * 3. Scores results by calling the fixture's EVAL.ts `check(files)` function on the host
 * 4. Logs everything to Braintrust
 *
 * Each fixture's EVAL.ts must export a default function:
 * ```ts
 * export default function check(files: Record<string, string>): boolean {
 *   return (files['src/index.ts'] ?? '').includes('greet');
 * }
 * ```
 */
export function createBraintrustEval(options: BraintrustEvalOptions): void {
  const { projectName, evalsDir, config: rawConfig } = options;
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
  const resolved = resolveConfig(rawConfig);
  const jiti = createJiti(import.meta.url);

  if (Array.isArray(resolved.model)) {
    throw new Error(
      'Array models are not supported in createBraintrustEval. Use a single model string.'
    );
  }

  const model = resolved.model as string;

  Eval(projectName, {
    data: async () => {
      const { fixtures, errors } = loadAllFixtures(evalsDir);
      if (errors.length > 0) {
        console.warn(
          `Fixture validation errors:\n${errors.map((e) => e.message).join('\n')}`
        );
      }
      return fixtures.map((fixture) => ({ input: fixture, expected: null }));
    },

    task: async (fixture: EvalFixture): Promise<EvalRunData> => {
      return runSingleEval(fixture, {
        agent: resolved.agent,
        model,
        timeout: resolved.timeout,
        apiKey,
        setup: resolved.setup,
        scripts: resolved.scripts,
        sandbox: resolved.sandbox,
        editPrompt: resolved.editPrompt,
      });
    },

    scores: [
      async ({ input: fixture, output }: { input: EvalFixture; output: EvalRunData }) => {
        const evalPath = join(fixture.path, 'EVAL.ts');
        try {
          const mod = await jiti.import(evalPath) as { default?: EvalCheckFn };
          if (typeof mod.default !== 'function') {
            throw new Error('EVAL.ts must export a default function');
          }
          const passed = await Promise.resolve(mod.default(output.generatedFiles ?? {}));
          return { name: 'passed', score: passed ? 1 : 0 };
        } catch (error) {
          console.error(`Scorer error for "${fixture.name}":`, error);
          return { name: 'passed', score: 0 };
        }
      },
    ],

    trialCount: resolved.runs,

    metadata: {
      agent: resolved.agent,
      model,
    },
  });
}
