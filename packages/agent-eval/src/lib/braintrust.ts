/**
 * Braintrust integration for running agent evals.
 *
 * Build your own dataset.ts, scorer.ts, and eval.ts:
 *
 * ```ts
 * // scorer.ts
 * import type { AgentEvalScorer } from '@supabase/agent-evals'
 *
 * export const myScorer: AgentEvalScorer<null> = async ({ output }) => ({
 *   name: 'has-index-file',
 *   score: 'src/index.ts' in (output.generatedFiles ?? {}) ? 1 : 0,
 * })
 *
 * // my-evals.eval.ts
 * import { Eval } from 'braintrust'
 * import { createAgentTask, builtinScorers } from '@supabase/agent-evals'
 * import { myScorer } from './scorer'
 *
 * Eval('my-project', {
 *   data: () => myDataset,
 *   task: createAgentTask({ agent: 'claude-code', model: 'opus' }),
 *   scores: [builtinScorers.passed, myScorer],
 *   trialCount: 1,
 * })
 * ```
 *
 * Run with: `npx braintrust eval my-evals.eval.ts`
 */

import { currentSpan, initDataset, init, type FullInitOptions } from 'braintrust';
import { createJiti } from 'jiti';
import { join } from 'path';
import type { ExperimentConfig, EvalFixture, EvalRunData, ExperimentResults } from './types.js';
import { resolveConfig } from './config.js';
import { runSingleEval } from './runner.js';
import { parseTranscriptSummary } from './o11y/index.js';

const jiti = createJiti(import.meta.url);

/** Check function used by builtinScorers.passed to validate agent output */
export type EvalCheckFn = (files: Record<string, string>) => boolean | Promise<boolean>;

/**
 * Scorer function type for agent evals.
 *
 * Matches Braintrust's EvalScorer shape with `input: EvalFixture` and `output: EvalRunData` fixed.
 * Return `null` to skip scoring for a given case (e.g. scorer is not applicable).
 *
 * ```ts
 * import type { AgentEvalScorer } from '@supabase/agent-evals'
 *
 * export const myScorer: AgentEvalScorer<{ mustHaveFile: string }> = async ({ output, expected }) => {
 *   if (!expected.mustHaveFile) return null
 *   return {
 *     name: 'file-presence',
 *     score: expected.mustHaveFile in (output.generatedFiles ?? {}) ? 1 : 0,
 *   }
 * }
 * ```
 */
export type AgentEvalScorer<Expected = unknown> = (args: {
  input: EvalFixture;
  output: EvalRunData;
  expected: Expected;
}) => Promise<{ name: string; score: number; metadata?: Record<string, unknown> } | null>
  | { name: string; score: number; metadata?: Record<string, unknown> } | null;

/**
 * Built-in scorers provided by the framework.
 *
 * `builtinScorers.passed` — scores 1 if the fixture's check function returns true.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const builtinScorers: Record<string, AgentEvalScorer<any>> = {
  passed: async ({ input: fixture, output }: { input: EvalFixture; output: EvalRunData; expected: unknown }) => {
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
};

/**
 * Push fixtures to a Braintrust dataset for versioning and sharing.
 * Local files remain the source of truth — Braintrust receives a snapshot.
 */
export async function pushFixturesToDataset(
  projectName: string,
  datasetName: string,
  fixtures: EvalFixture[]
): Promise<void> {
  const dataset = initDataset(projectName, { dataset: datasetName });
  for (const fixture of fixtures) {
    dataset.insert({
      input: { name: fixture.name, prompt: fixture.prompt },
      expected: null,
      metadata: { name: fixture.name, path: fixture.path },
    });
  }
  await dataset.flush();
}

/**
 * Creates a Braintrust-compatible task function that runs the configured agent on an EvalFixture.
 * Automatically instruments the run with phase-level child spans when called inside a Braintrust Eval.
 *
 * Pass the returned function directly to Braintrust's `Eval({ task: ... })`.
 *
 * ```ts
 * Eval('my-project', {
 *   data: () => dataset,
 *   task: createAgentTask({ agent: 'claude-code', model: 'opus' }),
 *   scores: [builtinScorers.passed],
 * })
 * ```
 */
export function createAgentTask(
  config: ExperimentConfig,
  options?: { apiKey?: string }
): (input: EvalFixture) => Promise<EvalRunData> {
  const resolved = resolveConfig(config);
  const apiKey = options?.apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';

  if (Array.isArray(resolved.model)) {
    throw new Error('createAgentTask requires a single model string, not an array.');
  }

  const model = resolved.model as string;

  return async (input: EvalFixture): Promise<EvalRunData> => {
    const parentSpan = currentSpan();
    // Spans that have been started but not yet ended (keyed by phase name).
    // agent:run is kept open after onPhase('end') so we can enrich it with transcript metrics.
    const openSpans = new Map<string, ReturnType<typeof parentSpan.startSpan>>();

    const result = await runSingleEval(input, {
      agent: resolved.agent,
      model,
      timeout: resolved.timeout,
      apiKey,
      setup: resolved.setup,
      teardown: resolved.teardown,
      scripts: resolved.scripts,
      sandbox: resolved.sandbox,
      editPrompt: resolved.editPrompt,
      onPhase: (name, status, durationMs) => {
        if (status === 'start') {
          openSpans.set(name, parentSpan.startSpan({ name }));
        } else {
          const span = openSpans.get(name);
          if (span) {
            if (durationMs !== undefined) span.log({ metrics: { durationMs } });
            // Keep agent:run open — we enrich it with transcript metrics below
            if (name !== 'agent:run') {
              span.end();
              openSpans.delete(name);
            }
          }
        }
      },
    });

    // Enrich the agent:run span with transcript metrics, then close it
    const agentRunSpan = openSpans.get('agent:run');
    if (agentRunSpan) {
      if (result.transcript) {
        try {
          const summary = parseTranscriptSummary(result.transcript, resolved.agent);
          agentRunSpan.log({
            metrics: {
              totalTurns: summary.totalTurns,
              totalToolCalls: summary.totalToolCalls,
              errors: summary.errors.length,
              thinkingBlocks: summary.thinkingBlocks,
            },
          });
        } catch {
          // transcript parsing is best-effort
        }
      }
      agentRunSpan.end();
      openSpans.delete('agent:run');
    }

    // Safety: close any remaining open spans
    for (const [, span] of openSpans) {
      span.end();
    }

    return result;
  };
}

/**
 * Options for uploading experiment results to Braintrust.
 */
export interface BraintrustUploadOptions {
  /** Braintrust project name (must already exist in your account) */
  projectName?: string;
  /** Braintrust project ID (alternative to projectName) */
  projectId?: string;
  /** Braintrust API key. Defaults to process.env.BRAINTRUST_API_KEY */
  apiKey?: string;
  /** Override experiment name. Defaults to `${model}-${startedAt}` */
  experimentName?: string;
}

/**
 * Upload already-completed experiment results to a new Braintrust experiment.
 * Creates one experiment for the run, logging each eval/run-index as a traced span.
 * Returns the Braintrust experiment URL.
 *
 * ```ts
 * import { runExperiment, uploadExperimentToBraintrust } from '@supabase/agent-evals'
 *
 * const results = await runExperiment({ config, fixtures, apiKey, resultsDir, experimentName })
 * const url = await uploadExperimentToBraintrust(results, {
 *   projectId: process.env.BRAINTRUST_PROJECT_ID,
 * }, fixtures)
 * console.log('Braintrust experiment:', url)
 * ```
 */
export async function uploadExperimentToBraintrust(
  results: ExperimentResults,
  options: BraintrustUploadOptions,
  fixtures?: EvalFixture[],
): Promise<string> {
  if (!options.projectId && !options.projectName) {
    throw new Error('Either projectId or projectName is required in BraintrustUploadOptions');
  }

  const { model, agent } = results.config;
  const experimentName = options.experimentName ?? `${model}-${results.startedAt}`;
  const fixtureMap = new Map((fixtures ?? []).map((f) => [f.name, f]));

  const initOptions: FullInitOptions<false> = {
    project: options.projectName,
    projectId: options.projectId,
    experiment: experimentName,
    apiKey: options.apiKey,
    metadata: {
      model,
      agent,
      startedAt: results.startedAt,
      completedAt: results.completedAt,
    },
  };

  const experiment = init(initOptions);

  for (const evalSummary of results.evals) {
    const fixture = fixtureMap.get(evalSummary.name);

    for (let runIndex = 0; runIndex < evalSummary.runs.length; runIndex++) {
      const run = evalSummary.runs[runIndex];

      const scores: Record<string, number> = {
        passed: run.result.status === 'passed' ? 1 : 0,
      };

      const metadata: Record<string, unknown> = {
        evalName: evalSummary.name,
        runIndex,
        duration: run.result.duration,
        model,
        agent,
      };

      if (run.transcript) {
        try {
          const summary = parseTranscriptSummary(run.transcript, agent);
          metadata.totalTurns = summary.totalTurns;
          metadata.totalToolCalls = summary.totalToolCalls;
          metadata.errors = summary.errors;
          metadata.thinkingBlocks = summary.thinkingBlocks;
        } catch {
          // transcript parsing is best-effort
        }
      }

      experiment.traced(
        (span) => {
          span.log({
            input: { eval: evalSummary.name, prompt: fixture?.prompt ?? '' },
            output: {
              status: run.result.status,
              error: run.result.error,
              scripts: run.outputContent?.scripts,
            },
            expected: null,
            scores,
            metadata,
            datasetRecordId: evalSummary.name,
          });
        },
        { name: `${evalSummary.name}/run-${runIndex}` },
      );
    }
  }

  const summary = await experiment.summarize();
  return summary.experimentUrl ?? '';
}

