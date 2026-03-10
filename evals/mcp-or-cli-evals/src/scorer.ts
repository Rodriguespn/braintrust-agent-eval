import type { ToolName } from '@supabase/agent-evals'
import type { EvalScorer } from 'braintrust'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToolCallInfo = {
  tool: ToolName
  path?: string
  command?: string
  success?: boolean
}

export type Input = {
  prompt: string
  scenarioName: string
}

export type Output = {
  finishReason: 'stop' | 'tool_call' | 'error'
  toolCalls: ToolCallInfo[]
  generatedFiles: Record<string, string>
}

export type Expected = Record<string, never>

// ---------------------------------------------------------------------------
// Operation mapping: MCP tool names ↔ CLI patterns
// ---------------------------------------------------------------------------

export type OperationMapping = {
  operation: string
  mcpPatterns: string[]
  cliPatterns: string[]
}

export const MCP_CLI_OPERATIONS: OperationMapping[] = [
  {
    operation: 'search docs',
    mcpPatterns: ['search_docs'],
    cliPatterns: [],
  },
  {
    operation: 'list tables',
    mcpPatterns: ['list_tables'],
    cliPatterns: ['supabase inspect db table-stats --local'],
  },
  {
    operation: 'list extensions',
    mcpPatterns: ['list_extensions'],
    cliPatterns: [],
  },
  {
    operation: 'list migrations',
    mcpPatterns: ['list_migrations'],
    cliPatterns: ['supabase migration list --local'],
  },
  {
    operation: 'apply migration',
    mcpPatterns: ['apply_migration'],
    cliPatterns: ['supabase migration up'],
  },
  {
    operation: 'execute sql',
    mcpPatterns: ['execute_sql'],
    cliPatterns: [],
  },
  {
    operation: 'get logs',
    mcpPatterns: ['get_logs'],
    cliPatterns: [],
  },
  {
    operation: 'get advisors',
    mcpPatterns: ['get_advisors'],
    cliPatterns: [],
  },
  {
    operation: 'get project url',
    mcpPatterns: ['get_project_url'],
    cliPatterns: ['supabase status'],
  },
  {
    operation: 'get publishable keys',
    mcpPatterns: ['get_publishable_keys'],
    cliPatterns: ['supabase status'],
  },
  {
    operation: 'generate typescript types',
    mcpPatterns: ['generate_typescript_types'],
    cliPatterns: ['supabase gen types typescript --local'],
  },
]

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export type ClassifiedCall = {
  method: 'mcp' | 'cli'
  operation: string
}

/**
 * Classify a single tool call as MCP, CLI, or unrelated (null).
 *
 * MCP calls appear as tool='unknown' with command matching an MCP tool name.
 * CLI calls appear as tool='shell' with command matching a CLI pattern.
 */
export function classifyToolCall(info: ToolCallInfo): ClassifiedCall | null {
  // Check MCP: tool_call with tool='unknown' and command matching an MCP pattern
  if (info.tool === 'unknown' && info.command) {
    for (const op of MCP_CLI_OPERATIONS) {
      if (op.mcpPatterns.some((p) => info.command!.includes(p))) {
        return { method: 'mcp', operation: op.operation }
      }
    }
  }

  // Check CLI: tool_call with tool='shell' and command matching a CLI pattern
  if (info.tool === 'shell' && info.command) {
    for (const op of MCP_CLI_OPERATIONS) {
      if (op.cliPatterns.some((p) => info.command!.includes(p))) {
        return { method: 'cli', operation: op.operation }
      }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Scorers
// ---------------------------------------------------------------------------

export type BreakdownEntry = {
  operation: string
  method: 'mcp' | 'cli'
}

/**
 * Scores the agent's preference for MCP vs CLI.
 *
 * Score = mcpCount / total
 *   1.0 = all MCP, 0.0 = all CLI
 *
 * Returns null if no trackable operations were found.
 */
export const mcpVsCliScorer: EvalScorer<Input, Output, Expected> = async ({ output }) => {
  const breakdown: BreakdownEntry[] = []

  for (const tc of output.toolCalls) {
    const classified = classifyToolCall(tc)
    if (classified) {
      breakdown.push({ operation: classified.operation, method: classified.method })
    }
  }

  if (breakdown.length === 0) return null

  const mcpCount = breakdown.filter((b) => b.method === 'mcp').length
  const cliCount = breakdown.filter((b) => b.method === 'cli').length
  const total = breakdown.length
  const score = mcpCount / total

  return {
    name: 'MCP vs CLI',
    score,
    metadata: {
      mcpCount,
      cliCount,
      total,
      breakdown,
    },
  }
}

/**
 * Scores tool call efficiency (ratio of successful calls).
 * Reused pattern from skills-eval.
 */
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
