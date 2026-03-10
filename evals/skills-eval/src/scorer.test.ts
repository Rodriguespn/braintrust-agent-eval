import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { readReferenceFilesContent, formatGeneratedFiles, matchesToolCall, matchesSpec, formatSpec, toolCallEfficiencyScorer, selfInflictedStrugglesScorer, formatTranscriptForJudge, type ToolCallInfo, type RequiredToolCall, type Input, type Output, type Expected, type TranscriptEventLike } from './scorer.js'

type ScoreResult = { name: string; score: number; metadata: Record<string, unknown> }

describe('readReferenceFilesContent', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'scorer-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true })
  })

  it('wraps file content in begin/end tags using filename with dots replaced by underscores', () => {
    const filePath = join(tempDir, 'best.practices.md')
    writeFileSync(filePath, 'use RLS')

    const result = readReferenceFilesContent([filePath])

    expect(result).toEqual(['<begin_best_practices_md>\nuse RLS\n<end_best_practices_md>'])
  })

  it('returns empty string for a file that does not exist', () => {
    const result = readReferenceFilesContent(['/nonexistent/path/file.md'])

    expect(result).toEqual([''])
  })

  it('handles multiple files', () => {
    const file1 = join(tempDir, 'a.md')
    const file2 = join(tempDir, 'b.md')
    writeFileSync(file1, 'content a')
    writeFileSync(file2, 'content b')

    const result = readReferenceFilesContent([file1, file2])

    expect(result).toEqual([
      '<begin_a_md>\ncontent a\n<end_a_md>',
      '<begin_b_md>\ncontent b\n<end_b_md>',
    ])
  })

  it('returns empty array for empty input', () => {
    expect(readReferenceFilesContent([])).toEqual([])
  })
})

describe('formatGeneratedFiles', () => {
  it('wraps each file in begin/end tags using basename with dots replaced by underscores', () => {
    const result = formatGeneratedFiles({ 'src/schema.sql': 'CREATE TABLE foo();' })

    expect(result).toBe('<begin_schema_sql>\nCREATE TABLE foo();\n<end_schema_sql>')
  })

  it('joins multiple files with double newlines', () => {
    const result = formatGeneratedFiles({
      'src/a.ts': 'const a = 1',
      'src/b.ts': 'const b = 2',
    })

    expect(result).toBe(
      '<begin_a_ts>\nconst a = 1\n<end_a_ts>\n\n<begin_b_ts>\nconst b = 2\n<end_b_ts>'
    )
  })

  it('filters out files inside hidden directories', () => {
    const result = formatGeneratedFiles({
      '.hidden/file.ts': 'secret',
      'src/visible.ts': 'public',
    })

    expect(result).toBe('<begin_visible_ts>\npublic\n<end_visible_ts>')
  })

  it('filters out hidden files at the root level', () => {
    const result = formatGeneratedFiles({
      '.env': 'SECRET=123',
      'src/app.ts': 'app',
    })

    expect(result).toBe('<begin_app_ts>\napp\n<end_app_ts>')
  })

  it('returns empty string for empty input', () => {
    expect(formatGeneratedFiles({})).toBe('')
  })

  it('returns empty string when all files are hidden', () => {
    expect(formatGeneratedFiles({ '.hidden/file.ts': 'x', '.env': 'y' })).toBe('')
  })
})

describe('matchesToolCall', () => {
  it('matches on tool name alone', () => {
    const info: ToolCallInfo = { tool: 'shell', command: 'npm install' }
    const req: RequiredToolCall = { tool: 'shell' }
    expect(matchesToolCall(info, req)).toBe(true)
  })

  it('rejects mismatched tool name', () => {
    const info: ToolCallInfo = { tool: 'file_read', path: '/tmp/x' }
    const req: RequiredToolCall = { tool: 'file_write' }
    expect(matchesToolCall(info, req)).toBe(false)
  })

  it('matches pathPattern as substring', () => {
    const info: ToolCallInfo = { tool: 'file_write', path: '/tmp/sandbox-123/supabase/migrations/001.sql' }
    const req: RequiredToolCall = { tool: 'file_write', pathPattern: 'migrations' }
    expect(matchesToolCall(info, req)).toBe(true)
  })

  it('rejects when pathPattern not found in path', () => {
    const info: ToolCallInfo = { tool: 'file_write', path: '/tmp/sandbox-123/src/index.ts' }
    const req: RequiredToolCall = { tool: 'file_write', pathPattern: 'migrations' }
    expect(matchesToolCall(info, req)).toBe(false)
  })

  it('rejects when pathPattern specified but path is missing', () => {
    const info: ToolCallInfo = { tool: 'file_write' }
    const req: RequiredToolCall = { tool: 'file_write', pathPattern: 'migrations' }
    expect(matchesToolCall(info, req)).toBe(false)
  })

  it('matches commandPattern as substring', () => {
    const info: ToolCallInfo = { tool: 'shell', command: 'npx supabase start 2>&1' }
    const req: RequiredToolCall = { tool: 'shell', commandPattern: 'supabase start' }
    expect(matchesToolCall(info, req)).toBe(true)
  })

  it('rejects when commandPattern not found', () => {
    const info: ToolCallInfo = { tool: 'shell', command: 'npm install' }
    const req: RequiredToolCall = { tool: 'shell', commandPattern: 'supabase start' }
    expect(matchesToolCall(info, req)).toBe(false)
  })
})

describe('matchesSpec', () => {
  const infos: ToolCallInfo[] = [
    { tool: 'shell', command: 'npx supabase start' },
    { tool: 'file_write', path: '/tmp/supabase/migrations/001.sql' },
  ]

  it('matches a single RequiredToolCall spec', () => {
    expect(matchesSpec(infos, { tool: 'shell', commandPattern: 'supabase start' })).toBe(true)
  })

  it('matches an OR-group when first alternative matches', () => {
    expect(
      matchesSpec(infos, [
        { tool: 'file_write', pathPattern: 'migrations' },
        { tool: 'file_edit', pathPattern: 'migrations' },
      ])
    ).toBe(true)
  })

  it('matches an OR-group when second alternative matches', () => {
    const infos2: ToolCallInfo[] = [{ tool: 'file_edit', path: '/tmp/migrations/001.sql' }]
    expect(
      matchesSpec(infos2, [
        { tool: 'file_write', pathPattern: 'migrations' },
        { tool: 'file_edit', pathPattern: 'migrations' },
      ])
    ).toBe(true)
  })

  it('returns false when no alternative matches', () => {
    expect(
      matchesSpec(infos, [
        { tool: 'shell', commandPattern: 'supabase db push' },
        { tool: 'shell', commandPattern: 'supabase db reset' },
      ])
    ).toBe(false)
  })
})

describe('formatSpec', () => {
  it('formats a simple tool spec', () => {
    expect(formatSpec({ tool: 'shell' })).toBe('shell')
  })

  it('formats a spec with commandPattern', () => {
    expect(formatSpec({ tool: 'shell', commandPattern: 'supabase start' })).toBe(
      'shell(cmd~supabase start)'
    )
  })

  it('formats a spec with pathPattern', () => {
    expect(formatSpec({ tool: 'file_write', pathPattern: 'migrations' })).toBe(
      'file_write(path~migrations)'
    )
  })

  it('formats an OR-group with pipe separator', () => {
    expect(
      formatSpec([
        { tool: 'file_write', pathPattern: 'migrations' },
        { tool: 'file_edit', pathPattern: 'migrations' },
      ])
    ).toBe('file_write(path~migrations) | file_edit(path~migrations)')
  })
})

describe('toolCallEfficiencyScorer', () => {
  const input: Input = { prompt: 'test', scenarioName: 'test' }
  const expected: Expected = { referenceFilesRead: [] }

  function makeOutput(toolCalls: ToolCallInfo[]): Output {
    return { finishReason: 'stop', referenceFilesRead: [], toolCalls, generatedFiles: {} }
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
      { tool: 'file_write', path: 'schema.sql', success: true },
      { tool: 'shell', command: 'npx supabase db push', success: true },
    ])
    const result = (await toolCallEfficiencyScorer({ input, output, expected })) as ScoreResult
    expect(result).not.toBeNull()
    expect(result.score).toBe(1)
    expect(result.metadata).toMatchObject({ total: 3, succeeded: 3, failed: 0, failures: [] })
  })

  it('returns 0.0 when all tool calls fail', async () => {
    const output = makeOutput([
      { tool: 'shell', command: 'npx supabase db push', success: false },
      { tool: 'shell', command: 'npx supabase db push', success: false },
    ])
    const result = (await toolCallEfficiencyScorer({ input, output, expected })) as ScoreResult
    expect(result).not.toBeNull()
    expect(result.score).toBe(0)
    expect(result.metadata).toMatchObject({ total: 2, succeeded: 0, failed: 2 })
  })

  it('returns correct ratio for mixed results', async () => {
    const output = makeOutput([
      { tool: 'file_read', path: 'README.md', success: true },
      { tool: 'shell', command: 'npx supabase db push', success: false },
      { tool: 'file_edit', path: 'schema.sql', success: true },
      { tool: 'shell', command: 'npx supabase db push', success: true },
    ])
    const result = (await toolCallEfficiencyScorer({ input, output, expected })) as ScoreResult
    expect(result).not.toBeNull()
    expect(result.score).toBe(0.75)
    expect(result.metadata).toMatchObject({ total: 4, succeeded: 3, failed: 1 })
    expect(result.metadata.failures).toEqual([{ tool: 'shell', command: 'npx supabase db push' }])
  })

  it('ignores tool calls without success data', async () => {
    const output = makeOutput([
      { tool: 'file_read', path: 'README.md' },
      { tool: 'shell', command: 'npx supabase start', success: true },
      { tool: 'shell', command: 'npx supabase db push', success: false },
    ])
    const result = (await toolCallEfficiencyScorer({ input, output, expected })) as ScoreResult
    expect(result).not.toBeNull()
    expect(result.score).toBe(0.5)
    expect(result.metadata).toMatchObject({ total: 2, succeeded: 1, failed: 1 })
  })

  it('includes path in failure metadata when available', async () => {
    const output = makeOutput([
      { tool: 'file_write', path: '/tmp/migrations/001.sql', success: false },
    ])
    const result = (await toolCallEfficiencyScorer({ input, output, expected })) as ScoreResult
    expect(result.metadata.failures).toEqual([{ tool: 'file_write', path: '/tmp/migrations/001.sql' }])
  })
})

describe('formatTranscriptForJudge', () => {
  it('formats assistant messages', () => {
    const events: TranscriptEventLike[] = [
      { type: 'message', role: 'assistant', content: 'Let me create the file' },
    ]
    expect(formatTranscriptForJudge(events)).toBe('[Assistant] Let me create the file')
  })

  it('skips user and system messages', () => {
    const events: TranscriptEventLike[] = [
      { type: 'message', role: 'user', content: 'Create a table' },
      { type: 'message', role: 'system', content: 'System prompt' },
      { type: 'message', role: 'assistant', content: 'On it' },
    ]
    expect(formatTranscriptForJudge(events)).toBe('[Assistant] On it')
  })

  it('formats tool calls with command', () => {
    const events: TranscriptEventLike[] = [
      { type: 'tool_call', tool: { name: 'shell', args: { _extractedCommand: 'npx supabase start' } } },
    ]
    expect(formatTranscriptForJudge(events)).toBe('[Tool Call] shell: npx supabase start')
  })

  it('formats tool calls with path', () => {
    const events: TranscriptEventLike[] = [
      { type: 'tool_call', tool: { name: 'file_read', args: { _extractedPath: 'src/index.ts' } } },
    ]
    expect(formatTranscriptForJudge(events)).toBe('[Tool Call] file_read: src/index.ts')
  })

  it('formats tool calls without detail', () => {
    const events: TranscriptEventLike[] = [
      { type: 'tool_call', tool: { name: 'glob', args: {} } },
    ]
    expect(formatTranscriptForJudge(events)).toBe('[Tool Call] glob')
  })

  it('formats successful tool results', () => {
    const events: TranscriptEventLike[] = [
      { type: 'tool_result', tool: { name: 'shell', result: 'Supabase started', success: true } },
    ]
    expect(formatTranscriptForJudge(events)).toBe('[Tool Result] ✓ Supabase started')
  })

  it('formats failed tool results', () => {
    const events: TranscriptEventLike[] = [
      { type: 'tool_result', tool: { name: 'shell', result: 'ERROR: relation already exists', success: false } },
    ]
    expect(formatTranscriptForJudge(events)).toBe('[Tool Result] ✗ ERROR: relation already exists')
  })

  it('formats error events', () => {
    const events: TranscriptEventLike[] = [
      { type: 'error', content: 'Something went wrong' },
    ]
    expect(formatTranscriptForJudge(events)).toBe('[Error] Something went wrong')
  })

  it('skips thinking events', () => {
    const events: TranscriptEventLike[] = [
      { type: 'thinking', content: 'Let me reason about this...' },
      { type: 'message', role: 'assistant', content: 'Done' },
    ]
    expect(formatTranscriptForJudge(events)).toBe('[Assistant] Done')
  })

  it('truncates long content', () => {
    const longContent = 'x'.repeat(600)
    const events: TranscriptEventLike[] = [
      { type: 'message', role: 'assistant', content: longContent },
    ]
    const result = formatTranscriptForJudge(events)
    expect(result).toContain('… [truncated]')
    expect(result.length).toBeLessThan(600)
  })

  it('truncates long tool results', () => {
    const longResult = 'y'.repeat(600)
    const events: TranscriptEventLike[] = [
      { type: 'tool_result', tool: { name: 'shell', result: longResult, success: true } },
    ]
    const result = formatTranscriptForJudge(events)
    expect(result).toContain('… [truncated]')
  })

  it('stringifies non-string tool results', () => {
    const events: TranscriptEventLike[] = [
      { type: 'tool_result', tool: { name: 'shell', result: { status: 'ok', rows: 5 }, success: true } },
    ]
    expect(formatTranscriptForJudge(events)).toBe('[Tool Result] ✓ {"status":"ok","rows":5}')
  })

  it('formats a full conversation flow', () => {
    const events: TranscriptEventLike[] = [
      { type: 'message', role: 'assistant', content: 'I will create the migration' },
      { type: 'tool_call', tool: { name: 'file_write', args: { _extractedPath: 'migrations/001.sql' } } },
      { type: 'tool_result', tool: { name: 'file_write', result: 'File written', success: true } },
      { type: 'tool_call', tool: { name: 'shell', args: { _extractedCommand: 'npx supabase db push' } } },
      { type: 'tool_result', tool: { name: 'shell', result: 'ERROR: syntax error', success: false } },
      { type: 'message', role: 'assistant', content: 'Let me fix the SQL' },
      { type: 'tool_call', tool: { name: 'file_edit', args: { _extractedPath: 'migrations/001.sql' } } },
      { type: 'tool_result', tool: { name: 'file_edit', result: 'File edited', success: true } },
      { type: 'tool_call', tool: { name: 'shell', args: { _extractedCommand: 'npx supabase db push' } } },
      { type: 'tool_result', tool: { name: 'shell', result: 'Migration applied', success: true } },
    ]
    const result = formatTranscriptForJudge(events)
    expect(result).toBe(
      [
        '[Assistant] I will create the migration',
        '[Tool Call] file_write: migrations/001.sql',
        '[Tool Result] ✓ File written',
        '[Tool Call] shell: npx supabase db push',
        '[Tool Result] ✗ ERROR: syntax error',
        '[Assistant] Let me fix the SQL',
        '[Tool Call] file_edit: migrations/001.sql',
        '[Tool Result] ✓ File edited',
        '[Tool Call] shell: npx supabase db push',
        '[Tool Result] ✓ Migration applied',
      ].join('\n')
    )
  })

  it('returns empty string for empty events', () => {
    expect(formatTranscriptForJudge([])).toBe('')
  })
})

describe('selfInflictedStrugglesScorer', () => {
  const input: Input = { prompt: 'Create a posts table', scenarioName: 'test' }
  const expected: Expected = { referenceFilesRead: [] }

  function makeOutput(transcript?: string): Output {
    return { finishReason: 'stop', referenceFilesRead: [], toolCalls: [], generatedFiles: {}, transcript }
  }

  it('returns null when transcript is missing', async () => {
    const output = makeOutput(undefined)
    const result = await selfInflictedStrugglesScorer({ input, output, expected })
    expect(result).toBeNull()
  })

  it('returns null when transcript is empty string', async () => {
    const output = makeOutput('')
    const result = await selfInflictedStrugglesScorer({ input, output, expected })
    expect(result).toBeNull()
  })
})
