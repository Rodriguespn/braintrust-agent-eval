import { ToolName } from '@supabase/agent-evals'
import { LLMClassifierFromTemplate } from 'autoevals'
import { EvalCase, EvalScorer } from 'braintrust'
import { stripIndent } from 'common-tags'
import { readFileSync } from 'fs'
import { basename } from 'path'

const LLM_AS_A_JUDGE_MODEL = 'gpt-5.2'

export type Input = {
  prompt: string
  scenarioName: string
}

export type ScenarioConfig = {
  prompt: string
  expected: Expected
  prestartSupabaseProject?: boolean
  tags?: string[]
  metadata?: SkillEvalCaseMetadata
}

export type ToolCallInfo = {
  tool: ToolName
  path?: string
  command?: string
  success?: boolean
}

export type RequiredToolCall = {
  tool: ToolName
  pathPattern?: string
  commandPattern?: string
}

// OR-group: any one alternative satisfying the requirement counts
export type RequiredToolCallSpec = RequiredToolCall | RequiredToolCall[]

export type Output = {
  finishReason: 'stop' | 'tool_call' | 'error'
  referenceFilesRead: string[]
  toolCalls: ToolCallInfo[]
  generatedFiles: Record<string, string>
  transcript?: string
}

export type Expected = {
  referenceFilesRead: string[]
  requiredToolCalls?: RequiredToolCallSpec[]
}

export type SkillEvalCaseCategory = 'database' | 'authentication' | 'realtime' | 'storage' | 'edge-functions' | 'development-flow' | 'sdk'

export type SkillEvalCaseMetadata = {
  category?: SkillEvalCaseCategory[]
  description?: string
}

export type SkillEvalCase = EvalCase<Input, Expected, SkillEvalCaseMetadata>

export function readReferenceFileContent(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf-8')
  } catch {
    return ''
  }
}

export function readReferenceFilesContent(filePaths: string[]): string[] {
  return filePaths.map((filePath) => {
    const content = readReferenceFileContent(filePath)
    if (!content) return ''
    const name = basename(filePath).replace(/\./g, '_')
    return `<begin_${name}>\n${content}\n<end_${name}>`
  })
}

export function matchesToolCall(info: ToolCallInfo, req: RequiredToolCall): boolean {
  if (info.tool !== req.tool) return false
  if (req.pathPattern && (!info.path || !info.path.includes(req.pathPattern))) return false
  if (req.commandPattern && (!info.command || !info.command.includes(req.commandPattern))) return false
  return true
}

export function matchesSpec(infos: ToolCallInfo[], spec: RequiredToolCallSpec): boolean {
  const alternatives = Array.isArray(spec) ? spec : [spec]
  return alternatives.some((req) => infos.some((info) => matchesToolCall(info, req)))
}

export function formatSpec(spec: RequiredToolCallSpec): string {
  const alternatives = Array.isArray(spec) ? spec : [spec]
  return alternatives
    .map((req) => {
      const parts: string[] = []
      if (req.pathPattern) parts.push(`path~${req.pathPattern}`)
      if (req.commandPattern) parts.push(`cmd~${req.commandPattern}`)
      return parts.length > 0 ? `${req.tool}(${parts.join(', ')})` : req.tool
    })
    .join(' | ')
}

export const toolUsageScorer: EvalScorer<Input, Output, Expected> = async ({
  output,
  expected,
}) => {
  if (!expected.requiredToolCalls) return null

  const used = expected.requiredToolCalls.filter((spec) => matchesSpec(output.toolCalls, spec))
  const notUsed = expected.requiredToolCalls.filter((spec) => !matchesSpec(output.toolCalls, spec))
  const totalCount = expected.requiredToolCalls.length
  const ratio = totalCount === 0 ? 1 : used.length / totalCount

  return {
    name: 'Tool Usage',
    score: ratio,
    metadata: {
      used: used.map(formatSpec),
      notUsed: notUsed.map(formatSpec),
    },
  }
}

export const referenceFilesReadScorer: EvalScorer<Input, Output, Expected> = async ({
  output,
  expected,
}) => {
  const read = expected.referenceFilesRead.filter((file) =>
    output.referenceFilesRead.includes(basename(file))
  )
  const notRead = expected.referenceFilesRead.filter(
    (file) => !output.referenceFilesRead.includes(basename(file))
  )
  const totalCount = expected.referenceFilesRead.length
  const ratio = totalCount === 0 ? 1 : read.length / totalCount

  return {
    name: 'Reference Files Read',
    score: ratio,
    metadata: {
      read: read.map((f) => basename(f)),
      notRead: notRead.map((f) => basename(f)),
    },
  }
}

const bestPracticeAppliedEvaluator = LLMClassifierFromTemplate<{
  input: string
  practice: string
}>({
  name: 'Best Practice Applied',
  promptTemplate: stripIndent`
    You are evaluating whether a specific Supabase best practice was correctly applied in generated code.

    ## What the user asked
    {{input}}

    ## Best practice to check
    {{practice}}

    ## Generated files
    {{output}}

    First, determine if this best practice is relevant to the user's request.
    If it is NOT relevant (the user's request does not require this practice), choose (a).

    If it IS relevant, check whether the generated code correctly implements it.

    Choose one:
    a) The practice is correctly applied in the generated code, OR the practice is not relevant to this request.
    b) The practice is relevant but NOT correctly applied in the generated code.
  `,
  choiceScores: { a: 1, b: 0 },
  useCoT: true,
  model: LLM_AS_A_JUDGE_MODEL,
})

export function formatGeneratedFiles(generatedFiles: Record<string, string>): string {
  return Object.entries(generatedFiles)
    .filter(([path]) => !path.split('/').some((segment) => segment.startsWith('.')))
    .map(([path, content]) => {
      const name = basename(path).replace(/\./g, '_')
      return `<begin_${name}>\n${content}\n<end_${name}>`
    })
    .join('\n\n')
}

export const supabaseBestPracticesScorer: EvalScorer<Input, Output, Expected> = async ({
  input,
  output,
  expected,
}) => {
  if (expected.referenceFilesRead.length === 0) return null
  if (Object.keys(output.generatedFiles).length === 0) return null

  const generatedFileContents = formatGeneratedFiles(output.generatedFiles)

  const results = await Promise.all(
    expected.referenceFilesRead.map(async (filePath) => {
      const content = readReferenceFileContent(filePath)
      if (!content) return null

      const practiceName = basename(filePath, '.md')
      const result = await bestPracticeAppliedEvaluator({
        input: input.prompt,
        practice: content,
        output: generatedFileContents,
      })

      return {
        practice: practiceName,
        score: result.score ?? 0,
        rationale: result.metadata?.rationale,
      }
    })
  )

  const evaluated = results.filter((r) => r !== null)
  if (evaluated.length === 0) return null

  const applied = evaluated.filter((r) => r.score === 1)
  const score = applied.length / evaluated.length

  return {
    name: 'Supabase Best Practices',
    score,
    metadata: {
      applied: applied.map((r) => r.practice),
      notApplied: evaluated.filter((r) => r.score === 0).map((r) => r.practice),
      details: evaluated.map(({ practice, score, rationale }) => ({ practice, score, rationale })),
    },
  }
}

export type TranscriptEventLike = {
  type: string
  role?: string
  content?: string
  tool?: {
    name: string
    args?: Record<string, unknown>
    result?: unknown
    success?: boolean
  }
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '… [truncated]'
}

export function formatTranscriptForJudge(events: TranscriptEventLike[]): string {
  const MAX_CONTENT_LENGTH = 500
  const MAX_RESULT_LENGTH = 500
  const lines: string[] = []

  for (const e of events) {
    switch (e.type) {
      case 'message':
        if (e.role === 'assistant' && e.content) {
          lines.push(`[Assistant] ${truncateText(e.content, MAX_CONTENT_LENGTH)}`)
        }
        break
      case 'tool_call':
        if (e.tool) {
          const args = e.tool.args || {}
          const detail = (args._extractedCommand || args._extractedPath || '') as string
          lines.push(`[Tool Call] ${e.tool.name}${detail ? `: ${detail}` : ''}`)
        }
        break
      case 'tool_result':
        if (e.tool) {
          const prefix = e.tool.success !== false ? '✓' : '✗'
          const result = typeof e.tool.result === 'string'
            ? e.tool.result
            : JSON.stringify(e.tool.result ?? '')
          lines.push(`[Tool Result] ${prefix} ${truncateText(result, MAX_RESULT_LENGTH)}`)
        }
        break
      case 'error':
        if (e.content) {
          lines.push(`[Error] ${truncateText(e.content, MAX_CONTENT_LENGTH)}`)
        }
        break
    }
  }

  return lines.join('\n')
}

export const toolCallEfficiencyScorer: EvalScorer<Input, Output, Expected> = async ({ output }) => {
  const assessed = output.toolCalls.filter((c) => c.success !== undefined)
  if (assessed.length === 0) return null

  const failed = assessed.filter((c) => c.success === false)
  const score = 1 - failed.length / assessed.length

  return {
    name: 'Tool Call Efficiency',
    score,
    metadata: {
      total: assessed.length,
      succeeded: assessed.length - failed.length,
      failed: failed.length,
      failures: failed.map((c) => ({
        tool: c.tool,
        ...(c.command && { command: c.command }),
        ...(c.path && { path: c.path }),
      })),
    },
  }
}

const selfInflictedStrugglesEvaluator = LLMClassifierFromTemplate<{
  input: string
}>({
  name: 'Self-Inflicted Struggles',
  promptTemplate: stripIndent`
    You are evaluating an AI coding agent's transcript to identify moments where the agent
    struggled due to its own decisions — NOT due to the user's request or environment issues
    outside the agent's control.

    ## Task the user asked the agent to perform
    {{input}}

    ## Agent transcript
    The transcript below shows the agent's actions in chronological order.
    - [Assistant] lines show what the agent said or decided
    - [Tool Call] lines show actions the agent took (tool name and arguments)
    - [Tool Result] lines show the outcome (✓ for success, ✗ for failure)
    - [Error] lines show errors encountered

    {{output}}

    ## What counts as a self-inflicted struggle

    A self-inflicted struggle is a sequence where:
    1. The agent makes a decision (runs a command, writes code, picks an approach)
    2. The decision fails or produces incorrect results
    3. The agent has to backtrack, retry, or redo the work

    Examples:
    - Agent writes a SQL migration with syntax errors → apply fails → agent fixes the SQL → re-applies
    - Agent creates a file with wrong logic → runs it → gets an error → edits the file to fix it
    - Agent picks the wrong CLI command → it fails → agent tries a different command
    - Agent forgets a required step (e.g., enabling RLS) → later notices the oversight → goes back to add it

    ## What does NOT count as a self-inflicted struggle

    - The user explicitly asked the agent to troubleshoot or debug something
    - An environment or infrastructure issue the agent could not have predicted (e.g., Docker not running, a port already in use, a network timeout)
    - Legitimate exploration: reading files, listing directories, or checking current state before acting
    - A single tool call that fails but the agent immediately handles it without wasted work (e.g., checking if a file exists before creating it)

    ## Your task

    Analyze the transcript and identify each distinct self-inflicted struggle. For each one, note:
    - What decision the agent made
    - What went wrong
    - How the agent recovered

    Then classify the overall struggle level:

    Choose one:
    a) No struggles: The agent executed its plan cleanly with no self-inflicted errors.
    b) Minor struggles: The agent had 1-2 small issues that were quickly fixed (e.g., a typo, a missing flag). Minimal wasted effort.
    c) Moderate struggles: The agent had multiple issues or spent significant effort fixing mistakes from its own decisions. Noticeable wasted work.
    d) Severe struggles: The agent repeatedly failed due to poor decisions, requiring major backtracking or a fundamentally different approach. Substantial wasted effort.
  `,
  choiceScores: { a: 1, b: 0.75, c: 0.4, d: 0 },
  useCoT: true,
  model: LLM_AS_A_JUDGE_MODEL,
})

export const selfInflictedStrugglesScorer: EvalScorer<Input, Output, Expected> = async ({
  input,
  output,
}) => {
  if (!output.transcript) return null

  const result = await selfInflictedStrugglesEvaluator({
    input: input.prompt,
    output: output.transcript,
  })

  return {
    name: 'Self-Inflicted Struggles',
    score: result.score ?? 0,
    metadata: {
      rationale: result.metadata?.rationale,
      choice: result.metadata?.choice,
    },
  }
}
