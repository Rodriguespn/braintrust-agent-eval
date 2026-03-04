import 'dotenv/config'
import { Eval } from 'braintrust'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve, basename } from 'node:path'
import { runSingleEval, parseTranscript, type EvalFixture } from '@supabase/agent-evals'
import { dataset } from './dataset.js'
import { toolUsageScorer, referenceFilesReadScorer, supabaseBestPracticesScorer } from './scorer.js'

const SCENARIO_DIR = resolve(process.cwd(), 'evals/canary-skill-test')
const RESULTS_DIR = resolve(process.cwd(), 'results')

Eval('Skills Canary', {
  projectId: process.env.BRAINTRUST_PROJECT_ID,
  data: () => dataset,
  task: async (input) => {
    const fixture: EvalFixture = {
      name: 'canary-skill-test',
      path: SCENARIO_DIR,
      prompt: input.prompt,
      isModule: false,
    }

    const evalRunData = await runSingleEval(fixture, {
      agent: 'claude-code',
      model: process.env.MODEL ?? 'claude-sonnet-4-6',
      timeout: 300,
      apiKey: process.env.ANTHROPIC_API_KEY ?? '',
      sandbox: 'docker',
    })

    // Write results to disk
    const runResultsDir = resolve(RESULTS_DIR, String(Date.now()))
    mkdirSync(runResultsDir, { recursive: true })
    for (const [filePath, content] of Object.entries(evalRunData.generatedFiles ?? {})) {
      writeFileSync(join(runResultsDir, basename(filePath)), content, 'utf-8')
    }
    if (evalRunData.transcript) {
      writeFileSync(join(runResultsDir, 'transcript.jsonl'), evalRunData.transcript, 'utf-8')
    }

    // Parse transcript for events + summary
    const transcript = evalRunData.transcript
      ? parseTranscript(evalRunData.transcript, 'claude-code')
      : null

    const events = transcript?.events ?? []
    const summary = transcript?.summary
    const referenceFilesRead = (summary?.filesRead ?? []).map((p) => basename(p))
    const toolsUsed = summary
      ? Object.entries(summary.toolCalls)
          .filter(([, count]) => count > 0)
          .map(([name]) => name)
      : []

    const finishReason: 'stop' | 'tool_call' | 'error' =
      evalRunData.result.status === 'failed' ? 'error' : 'stop'

    return { finishReason, events, referenceFilesRead, toolsUsed, outputDir: runResultsDir }
  },
  scores: [toolUsageScorer, referenceFilesReadScorer, supabaseBestPracticesScorer],
})
