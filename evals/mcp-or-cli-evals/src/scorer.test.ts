import { describe, it, expect } from 'vitest'
import {
  classifyToolCall,
  mcpVsCliScorer,
  toolCallEfficiencyScorer,
  type ToolCallInfo,
  type Input,
  type Output,
  type Expected,
  type BreakdownEntry,
} from './scorer.js'

type ScoreResult = { name: string; score: number; metadata: Record<string, unknown> }

// ---------------------------------------------------------------------------
// classifyToolCall
// ---------------------------------------------------------------------------

describe('classifyToolCall', () => {
  it('returns null for non-trackable calls (file_read)', () => {
    const info: ToolCallInfo = { tool: 'file_read', path: '/tmp/foo.ts' }
    expect(classifyToolCall(info)).toBeNull()
  })

  it('returns null for non-trackable shell calls (npm install)', () => {
    const info: ToolCallInfo = { tool: 'shell', command: 'npm install' }
    expect(classifyToolCall(info)).toBeNull()
  })

  it('returns null for glob calls', () => {
    const info: ToolCallInfo = { tool: 'glob' }
    expect(classifyToolCall(info)).toBeNull()
  })

  it('classifies MCP execute_sql call', () => {
    const info: ToolCallInfo = { tool: 'unknown', command: 'execute_sql' }
    expect(classifyToolCall(info)).toEqual({ method: 'mcp', operation: 'execute_sql' })
  })

  it('classifies MCP list_tables call', () => {
    const info: ToolCallInfo = { tool: 'unknown', command: 'list_tables' }
    expect(classifyToolCall(info)).toEqual({ method: 'mcp', operation: 'list_tables' })
  })

  it('classifies MCP get_advisors call', () => {
    const info: ToolCallInfo = { tool: 'unknown', command: 'get_advisors' }
    expect(classifyToolCall(info)).toEqual({ method: 'mcp', operation: 'get_advisors' })
  })

  it('classifies MCP apply_migration call', () => {
    const info: ToolCallInfo = { tool: 'unknown', command: 'apply_migration' }
    expect(classifyToolCall(info)).toEqual({ method: 'mcp', operation: 'apply_migration' })
  })

  it('classifies MCP generate_typescript_types call', () => {
    const info: ToolCallInfo = { tool: 'unknown', command: 'generate_typescript_types' }
    expect(classifyToolCall(info)).toEqual({ method: 'mcp', operation: 'generate_typescript_types' })
  })

  it('classifies MCP list_migrations call', () => {
    const info: ToolCallInfo = { tool: 'unknown', command: 'list_migrations' }
    expect(classifyToolCall(info)).toEqual({ method: 'mcp', operation: 'list_migrations' })
  })

  it('classifies MCP get_project_url call', () => {
    const info: ToolCallInfo = { tool: 'unknown', command: 'get_project_url' }
    expect(classifyToolCall(info)).toEqual({ method: 'mcp', operation: 'get_project_url' })
  })

  it('classifies MCP get_publishable_keys call', () => {
    const info: ToolCallInfo = { tool: 'unknown', command: 'get_publishable_keys' }
    expect(classifyToolCall(info)).toEqual({ method: 'mcp', operation: 'get_publishable_keys' })
  })

  it('classifies CLI supabase gen types call', () => {
    const info: ToolCallInfo = { tool: 'shell', command: 'npx supabase gen types --local' }
    expect(classifyToolCall(info)).toEqual({ method: 'cli', operation: 'generate_typescript_types' })
  })

  it('classifies CLI supabase migration list call', () => {
    const info: ToolCallInfo = { tool: 'shell', command: 'npx supabase migration list' }
    expect(classifyToolCall(info)).toEqual({ method: 'cli', operation: 'list_migrations' })
  })

  it('classifies CLI supabase db push call', () => {
    const info: ToolCallInfo = { tool: 'shell', command: 'npx supabase db push --local' }
    expect(classifyToolCall(info)).toEqual({ method: 'cli', operation: 'apply_migration' })
  })

  it('classifies CLI supabase db reset call', () => {
    const info: ToolCallInfo = { tool: 'shell', command: 'npx supabase db reset' }
    expect(classifyToolCall(info)).toEqual({ method: 'cli', operation: 'apply_migration' })
  })

  it('classifies CLI supabase migration up call', () => {
    const info: ToolCallInfo = { tool: 'shell', command: 'npx supabase migration up --local' }
    expect(classifyToolCall(info)).toEqual({ method: 'cli', operation: 'apply_migration' })
  })

  it('classifies psql as CLI for execute_sql', () => {
    const info: ToolCallInfo = { tool: 'shell', command: 'psql postgresql://localhost:54322/postgres -c "SELECT * FROM products"' }
    expect(classifyToolCall(info)).toEqual({ method: 'cli', operation: 'execute_sql' })
  })

  it('classifies supabase status as CLI for get_project_url', () => {
    const info: ToolCallInfo = { tool: 'shell', command: 'npx supabase status' }
    expect(classifyToolCall(info)).toEqual({ method: 'cli', operation: 'get_project_url' })
  })

  it('classifies supabase inspect db table-stats as CLI for list_tables', () => {
    const info: ToolCallInfo = { tool: 'shell', command: 'npx supabase inspect db table-stats' }
    expect(classifyToolCall(info)).toEqual({ method: 'cli', operation: 'list_tables' })
  })

  it('classifies supabase inspect db as CLI for get_advisors', () => {
    const info: ToolCallInfo = { tool: 'shell', command: 'npx supabase inspect db long-running-queries' }
    expect(classifyToolCall(info)).toEqual({ method: 'cli', operation: 'get_advisors' })
  })

  it('returns null for unknown tool without command', () => {
    const info: ToolCallInfo = { tool: 'unknown' }
    expect(classifyToolCall(info)).toBeNull()
  })

  it('returns null for shell without command', () => {
    const info: ToolCallInfo = { tool: 'shell' }
    expect(classifyToolCall(info)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// mcpVsCliScorer
// ---------------------------------------------------------------------------

describe('mcpVsCliScorer', () => {
  const input: Input = { prompt: 'test', scenarioName: 'test' }
  const expected: Expected = {}

  function makeOutput(toolCalls: ToolCallInfo[]): Output {
    return { finishReason: 'stop', toolCalls, generatedFiles: {} }
  }

  it('returns null for empty tool calls', async () => {
    const output = makeOutput([])
    const result = await mcpVsCliScorer({ input, output, expected })
    expect(result).toBeNull()
  })

  it('returns null when no tool calls match tracked operations', async () => {
    const output = makeOutput([
      { tool: 'file_read', path: '/tmp/foo.ts' },
      { tool: 'shell', command: 'npm install' },
      { tool: 'glob' },
    ])
    const result = await mcpVsCliScorer({ input, output, expected })
    expect(result).toBeNull()
  })

  it('returns score 1.0 for all-MCP calls', async () => {
    const output = makeOutput([
      { tool: 'unknown', command: 'execute_sql' },
      { tool: 'unknown', command: 'list_tables' },
      { tool: 'unknown', command: 'get_advisors' },
    ])
    const result = (await mcpVsCliScorer({ input, output, expected })) as ScoreResult
    expect(result).not.toBeNull()
    expect(result.score).toBe(1.0)
    expect(result.metadata).toMatchObject({ mcpCount: 3, cliCount: 0, total: 3 })
  })

  it('returns score 0.0 for all-CLI calls', async () => {
    const output = makeOutput([
      { tool: 'shell', command: 'psql postgresql://localhost/postgres -c "SELECT 1"' },
      { tool: 'shell', command: 'npx supabase gen types --local' },
    ])
    const result = (await mcpVsCliScorer({ input, output, expected })) as ScoreResult
    expect(result).not.toBeNull()
    expect(result.score).toBe(0.0)
    expect(result.metadata).toMatchObject({ mcpCount: 0, cliCount: 2, total: 2 })
  })

  it('returns correct ratio for mixed calls (2 MCP + 1 CLI)', async () => {
    const output = makeOutput([
      { tool: 'unknown', command: 'execute_sql' },
      { tool: 'unknown', command: 'list_tables' },
      { tool: 'shell', command: 'npx supabase gen types --local' },
    ])
    const result = (await mcpVsCliScorer({ input, output, expected })) as ScoreResult
    expect(result).not.toBeNull()
    expect(result.score).toBeCloseTo(2 / 3)
    expect(result.metadata).toMatchObject({ mcpCount: 2, cliCount: 1, total: 3 })
  })

  it('ignores non-trackable calls in the mix', async () => {
    const output = makeOutput([
      { tool: 'file_read', path: '/tmp/foo.ts' },
      { tool: 'unknown', command: 'execute_sql' },
      { tool: 'shell', command: 'npm install' },
      { tool: 'shell', command: 'npx supabase gen types --local' },
    ])
    const result = (await mcpVsCliScorer({ input, output, expected })) as ScoreResult
    expect(result).not.toBeNull()
    expect(result.score).toBe(0.5)
    expect(result.metadata).toMatchObject({ mcpCount: 1, cliCount: 1, total: 2 })
  })

  it('has accurate breakdown entries', async () => {
    const output = makeOutput([
      { tool: 'unknown', command: 'execute_sql' },
      { tool: 'shell', command: 'npx supabase migration list' },
    ])
    const result = (await mcpVsCliScorer({ input, output, expected })) as ScoreResult
    expect(result).not.toBeNull()
    expect(result.metadata.breakdown).toEqual([
      { operation: 'execute_sql', method: 'mcp' },
      { operation: 'list_migrations', method: 'cli' },
    ] satisfies BreakdownEntry[])
  })
})

// ---------------------------------------------------------------------------
// toolCallEfficiencyScorer
// ---------------------------------------------------------------------------

describe('toolCallEfficiencyScorer', () => {
  const input: Input = { prompt: 'test', scenarioName: 'test' }
  const expected: Expected = {}

  function makeOutput(toolCalls: ToolCallInfo[]): Output {
    return { finishReason: 'stop', toolCalls, generatedFiles: {} }
  }

  it('returns null when no tool calls have success data', async () => {
    const output = makeOutput([{ tool: 'shell', command: 'ls' }])
    const result = await toolCallEfficiencyScorer({ input, output, expected })
    expect(result).toBeNull()
  })

  it('returns null for empty tool calls', async () => {
    const output = makeOutput([])
    const result = await toolCallEfficiencyScorer({ input, output, expected })
    expect(result).toBeNull()
  })

  it('returns 1.0 when all tool calls succeed', async () => {
    const output = makeOutput([
      { tool: 'shell', command: 'npx supabase start', success: true },
      { tool: 'unknown', command: 'execute_sql', success: true },
    ])
    const result = (await toolCallEfficiencyScorer({ input, output, expected })) as ScoreResult
    expect(result).not.toBeNull()
    expect(result.score).toBe(1.0)
  })

  it('returns 0.0 when all tool calls fail', async () => {
    const output = makeOutput([
      { tool: 'shell', command: 'npx supabase db push', success: false },
      { tool: 'shell', command: 'npx supabase db push', success: false },
    ])
    const result = (await toolCallEfficiencyScorer({ input, output, expected })) as ScoreResult
    expect(result).not.toBeNull()
    expect(result.score).toBe(0.0)
  })

  it('returns correct ratio for mixed results', async () => {
    const output = makeOutput([
      { tool: 'unknown', command: 'execute_sql', success: true },
      { tool: 'shell', command: 'npx supabase db push', success: false },
      { tool: 'unknown', command: 'execute_sql', success: true },
      { tool: 'shell', command: 'npx supabase db push', success: true },
    ])
    const result = (await toolCallEfficiencyScorer({ input, output, expected })) as ScoreResult
    expect(result).not.toBeNull()
    expect(result.score).toBe(0.75)
  })
})
