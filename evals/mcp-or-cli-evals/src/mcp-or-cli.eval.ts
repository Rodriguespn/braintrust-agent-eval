import 'dotenv/config'
import { Eval, initLogger, currentSpan } from 'braintrust'
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { runSingleEval, parseTranscript, setupSupabaseSandbox, teardownSupabaseSandbox, prestartSupabaseProject, getAgentAdapter, type AgentType, type EvalFixture } from '@supabase/agent-evals'
import { scenarios } from './dataset.js'
import { mcpVsCliScorer, toolCallEfficiencyScorer, type Output, type ToolCallInfo } from './scorer.js'

const EVALS_DIR = resolve(process.cwd(), 'evals')
const RESULTS_DIR = resolve(process.cwd(), 'results')
const MODEL = process.env.MODEL ?? 'claude-sonnet-4-6'
const SKILLS_DIR = '/Users/pedrorodrigues/supabase-agent-skills/skills/supabase'

if (process.env.BRAINTRUST_API_KEY && process.env.BRAINTRUST_PROJECT_ID) {
  initLogger({
    apiKey: process.env.BRAINTRUST_API_KEY,
    projectId: process.env.BRAINTRUST_PROJECT_ID,
  })
}

function collectSkillFiles(dir: string, prefix: string): Record<string, string> {
  const files: Record<string, string> = {}
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const relPath = prefix ? `${prefix}/${entry}` : entry
    if (statSync(fullPath).isDirectory()) {
      Object.assign(files, collectSkillFiles(fullPath, relPath))
    } else {
      files[relPath] = readFileSync(fullPath, 'utf-8')
    }
  }
  return files
}

type Span = ReturnType<typeof currentSpan>
type EvalRunData = Exclude<Awaited<ReturnType<typeof runSingleEval>>, unknown[]>
type TranscriptSummary = NonNullable<ReturnType<typeof parseTranscript>>['summary']
type TranscriptEvent = NonNullable<ReturnType<typeof parseTranscript>>['events'][number]

type TokenUsage = {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
}

class PhaseTracker {
  private openSpans = new Map<string, ReturnType<Span['startSpan']>>()

  constructor(private parentSpan: Span) {}

  onPhase = (name: string, status: string, durationMs?: number) => {
    if (status === 'start') {
      this.openSpans.set(name, this.parentSpan.startSpan({ name }))
    } else {
      const span = this.openSpans.get(name)
      if (span) {
        if (durationMs !== undefined) span.log({ metrics: { durationMs } })
        if (name !== 'agent:run') {
          span.end()
          this.openSpans.delete(name)
        }
      }
    }
  }

  finalize(summary?: TranscriptSummary) {
    const agentRunSpan = this.openSpans.get('agent:run')
    if (agentRunSpan) {
      if (summary) {
        agentRunSpan.log({
          metrics: {
            totalTurns: summary.totalTurns,
            totalToolCalls: summary.totalToolCalls,
            errors: summary.errors.length,
            thinkingBlocks: summary.thinkingBlocks,
          },
        })
      }
      agentRunSpan.end()
      this.openSpans.delete('agent:run')
    }
    for (const [, span] of this.openSpans) span.end()
  }
}

function writeResultsToDisk(baseResultsDir: string, evalRunData: EvalRunData) {
  const runDir = resolve(baseResultsDir, new Date().toISOString().replace(/:/g, '-').replace(/\.\d{3}Z$/, 'Z'))
  const outputDir = resolve(runDir, 'output')
  mkdirSync(outputDir, { recursive: true })
  for (const [filePath, content] of Object.entries(evalRunData.generatedFiles ?? {})) {
    const dest = join(outputDir, filePath)
    mkdirSync(resolve(dest, '..'), { recursive: true })
    writeFileSync(dest, content, 'utf-8')
  }
  if (evalRunData.transcript) {
    writeFileSync(join(runDir, 'transcript.jsonl'), evalRunData.transcript, 'utf-8')
  }
}

function accumulateTokenUsage(events: TranscriptEvent[]): TokenUsage {
  let inputTokens = 0, outputTokens = 0, cacheCreationTokens = 0, cacheReadTokens = 0
  for (const event of events) {
    if (event.type !== 'message' || event.role !== 'assistant') continue
    const raw = event.raw as Record<string, unknown> | undefined
    const message = raw?.message as Record<string, unknown> | undefined
    const usage = message?.usage as Record<string, number> | undefined
    if (usage) {
      inputTokens += usage.input_tokens ?? 0
      outputTokens += usage.output_tokens ?? 0
      cacheCreationTokens += usage.cache_creation_input_tokens ?? 0
      cacheReadTokens += usage.cache_read_input_tokens ?? 0
    }
  }
  return { inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens }
}

function logSpanMetadata(parentSpan: Span, opts: {
  model: string
  agent: string
  summary?: TranscriptSummary
  evalRunData: EvalRunData
  transcript: ReturnType<typeof parseTranscript> | null
  tokens: TokenUsage
}) {
  const { summary, evalRunData, transcript, tokens } = opts
  parentSpan.log({
    metadata: {
      model: opts.model,
      agent: opts.agent,
      totalTurns: summary?.totalTurns,
      totalToolCalls: summary?.totalToolCalls,
      toolCalls: summary?.toolCalls,
      errorCount: summary?.errors.length,
      duration: evalRunData.result.duration,
      status: evalRunData.result.status,
      parseSuccess: transcript?.parseSuccess,
    },
    metrics: {
      prompt_tokens: tokens.inputTokens + tokens.cacheCreationTokens,
      completion_tokens: tokens.outputTokens,
      tokens: tokens.inputTokens + tokens.outputTokens + tokens.cacheCreationTokens,
      cache_creation_input_tokens: tokens.cacheCreationTokens,
      cache_read_input_tokens: tokens.cacheReadTokens,
    },
  })
}

function buildToolCallInfos(events: TranscriptEvent[]): ToolCallInfo[] {
  // Build a map from tool_use_id -> success by scanning tool_result events
  const resultMap = new Map<string, boolean>()
  for (const e of events) {
    if (e.type === 'tool_result' && e.tool) {
      resultMap.set(e.tool.originalName, e.tool.success ?? true)
    }
  }

  // Track pending tool_call IDs for positional fallback
  const pendingIds: string[] = []
  const infos: ToolCallInfo[] = []

  for (const e of events) {
    if (e.type === 'tool_call' && e.tool) {
      const info: ToolCallInfo = { tool: e.tool.name }
      const args = e.tool.args || {}
      if (args._extractedPath) info.path = args._extractedPath as string
      if (args._extractedCommand) info.command = args._extractedCommand as string
      // For unknown tools (e.g. MCP calls), expose the original tool name as command
      if (info.tool === 'unknown' && !info.command && e.tool.originalName) {
        info.command = e.tool.originalName
      }

      // Pair with tool_result by tool_use_id from raw data
      const raw = e.raw as Record<string, unknown> | undefined
      const toolUseId = raw?.id as string | undefined
      if (toolUseId && resultMap.has(toolUseId)) {
        info.success = resultMap.get(toolUseId)
      }
      if (toolUseId) pendingIds.push(toolUseId)

      infos.push(info)
    } else if (e.type === 'tool_result' && e.tool) {
      // Positional fallback: if a tool_result wasn't matched by ID above,
      // assign its success to the oldest pending tool_call that lacks one
      const resultId = e.tool.originalName
      const matchIdx = pendingIds.indexOf(resultId)
      if (matchIdx !== -1) {
        pendingIds.splice(matchIdx, 1)
      } else if (pendingIds.length > 0) {
        const pending = infos.find((i) => i.success === undefined)
        if (pending) {
          pending.success = e.tool.success ?? true
        }
        pendingIds.shift()
      }
    }
  }

  return infos
}

function buildTaskOutput(events: TranscriptEvent[], evalRunData: EvalRunData): Output {
  const toolCalls = buildToolCallInfos(events)
  const finishReason: Output['finishReason'] =
    evalRunData.result.status === 'failed' ? 'error' : 'stop'

  return { finishReason, toolCalls, generatedFiles: evalRunData.generatedFiles ?? {} }
}

const AGENT = (process.env.AGENT ?? 'claude-code') as AgentType
const agentAdapter = getAgentAdapter(AGENT)
const EVAL_SCENARIO = process.env.EVAL_SCENARIO
const EVAL_BASELINE = process.env.EVAL_BASELINE === 'true'
const MCP_TOOL_COUNT = process.env.MCP_TOOL_COUNT ? parseInt(process.env.MCP_TOOL_COUNT) : null

const activeScenarios = Object.entries(scenarios).filter(
  ([name]) => !EVAL_SCENARIO || name === EVAL_SCENARIO,
)

Eval('MCP vs CLI', {
  projectId: process.env.BRAINTRUST_PROJECT_ID,
  metadata: {
    model: MODEL,
    agent: agentAdapter.agentName,
    baseline: EVAL_BASELINE,
    mcpToolCount: MCP_TOOL_COUNT,
  },
  data: () =>
    activeScenarios.map(([name, cfg]) => ({
      input: { prompt: cfg.prompt, scenarioName: name },
      expected: {},
      tags: cfg.tags,
      metadata: {
        ...cfg.metadata,
        baseline: EVAL_BASELINE,
        mcpToolCount: MCP_TOOL_COUNT,
      },
    })),
  task: async (input) => {
    const scenarioDir = resolve(EVALS_DIR, input.scenarioName)
    const fixture: EvalFixture = { name: input.scenarioName, path: scenarioDir, prompt: input.prompt }
    const scenario = scenarios[input.scenarioName]
    const shouldPrestartSupabase = scenario?.prestartSupabaseProject ?? true

    const parentSpan = currentSpan()
    const phaseTracker = new PhaseTracker(parentSpan)

    const evalRunData = await runSingleEval(fixture, {
      agent: AGENT,
      model: MODEL,
      timeout: 600,
      apiKey: process.env.ANTHROPIC_API_KEY ?? '',
      sandbox: 'docker',
      networkMode: 'host',
      setup: async (sandbox) => {
        await setupSupabaseSandbox(sandbox)
        if (shouldPrestartSupabase) {
          await prestartSupabaseProject(sandbox)
        }
        if (!EVAL_BASELINE) {
          await sandbox.writeFiles({
            ...collectSkillFiles(SKILLS_DIR, '.agents/skills/supabase'),
            ...collectSkillFiles(SKILLS_DIR, `${agentAdapter.agentSkillsDir}/supabase`),
          })
        }
      },
      teardown: (sandbox) => teardownSupabaseSandbox(sandbox),
      onPhase: phaseTracker.onPhase,
    })

    writeResultsToDisk(RESULTS_DIR, evalRunData)

    const transcript = evalRunData.transcript
      ? parseTranscript(evalRunData.transcript, agentAdapter.agentName)
      : null
    const tokens = accumulateTokenUsage(transcript?.events ?? [])

    phaseTracker.finalize(transcript?.summary)
    logSpanMetadata(parentSpan, {
      model: MODEL, agent: agentAdapter.agentName,
      summary: transcript?.summary, evalRunData, transcript, tokens,
    })

    return buildTaskOutput(transcript?.events ?? [], evalRunData)
  },
  scores: [mcpVsCliScorer, toolCallEfficiencyScorer],
})
