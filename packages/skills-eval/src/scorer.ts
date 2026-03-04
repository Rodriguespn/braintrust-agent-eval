import { LLMClassifierFromTemplate } from 'autoevals'
import { EvalCase, EvalScorer } from 'braintrust'
import { stripIndent } from 'common-tags'
import { readFileSync } from 'fs'
import { TranscriptEvent } from '@supabase/agent-evals'

type Input = {
  prompt: string
}

type Output = {
  finishReason: 'stop' | 'tool_call' | 'error'
  events: TranscriptEvent[]
  referenceFilesRead: string[]
  toolsUsed: string[]
  outputDir: string
}

export type Expected = {
  referenceFilesRead: string[]
  requiredTools?: string[]
}

export type SkillEvalCaseCategory = 'database' | 'authentication' | 'realtime' | 'storage' | 'edge-functions' | 'develpment-flow' | 'sdk'

export type SkillEvalCaseMetadata = {
  category?: SkillEvalCaseCategory[]
  description?: string
}

export type SkillEvalCase = EvalCase<Input, Expected, SkillEvalCaseMetadata>

const LLM_AS_A_JUDGE_MODEL = 'claude-opus-4-6'

function readReferenceFilesContent(filePaths: string[]): string[] {
  return filePaths.map((filePath) => {
    try {
      return readFileSync(filePath, 'utf-8')
    } catch {
      return ''
    }
  })
}

export const toolUsageScorer: EvalScorer<Input, Output, Expected> = async ({
  output,
  expected,
}) => {
  if (!expected.requiredTools) return null

  const presentCount = expected.requiredTools.filter((tool) =>
    output.toolsUsed.includes(tool)
  ).length
  const totalCount = expected.requiredTools.length
  const ratio = totalCount === 0 ? 1 : presentCount / totalCount

  return {
    name: 'Tool Usage',
    score: ratio,
  }
}

export const referenceFilesReadScorer: EvalScorer<Input, Output, Expected> = async ({
  output,
  expected,
}) => {
  const presentCount = expected.referenceFilesRead.filter((file) =>
    output.referenceFilesRead.includes(file)
  ).length
  const totalCount = expected.referenceFilesRead.length
  const ratio = totalCount === 0 ? 1 : presentCount / totalCount

  return {
    name: 'Reference Files Read',
    score: ratio,
  }
}

const supabaseBestPracticesCompletionEvaluator = LLMClassifierFromTemplate<{
  input: string
  bestPractices: string[]
  outputDir: string
}>({
  name: 'Best Practices',
  promptTemplate: stripIndent`
    Evaluate whether this response applies Supabase best practices regarding what the user asked.

    What the user asked: {{input}}

    You MUST NOT search the web when looking for Supabase best practices. The only best practices relevant for what the user asked are:
    {{bestPractices}}

    Start by identifying the best practices that should be applied to what the user asked.
    Then, check the content of the files that where created/edited after performing what the user asked, inside {{outputDir}} directory.
    Find the best practices that are implemented in the files of the output directory.

   Are the best practices that you identified as relevant applied in the output files? Choose one of the following options:
    a) Yes, all the relevant best practices are applied in the output files.
    b) Some of the relevant best practices are applied in the output files.
    c) No, none of the relevant best practices are applied in the output files.
  `,
  choiceScores: { a: 1, b: 0.5, c: 0 },
  useCoT: true,
  model: LLM_AS_A_JUDGE_MODEL,
})

export const supabaseBestPracticesScorer: EvalScorer<Input, Output, Expected> = async ({
  input,
  output,
  expected,
}) => {
  return await supabaseBestPracticesCompletionEvaluator({
      input: input.prompt,
      bestPractices: readReferenceFilesContent(expected.referenceFilesRead),
      outputDir: output.outputDir,
      output: "" // We want the model to evaluate based on the files in the output directory, so we don't provide the events as context
  })
}
