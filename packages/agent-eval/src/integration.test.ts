/**
 * End-to-end integration tests for the eval framework.
 *
 * These tests require a valid Anthropic API key and Docker.
 * Run with: INTEGRATION_TEST=1 npm test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { config as dotenvConfig } from 'dotenv';
import { runSingleEval } from './lib/runner.js';
import { getSandboxBackendInfo } from './lib/sandbox.js';
import type { EvalFixture } from './lib/types.js';

// Load .env file (try .env.local first, then .env)
dotenvConfig();

const TEST_DIR = '/tmp/eval-framework-integration-test';

// Check if Docker is available (for sandbox backend)
function isDockerAvailableSync(): boolean {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const hasDockerSandbox = isDockerAvailableSync();

// Direct API credentials (need API key + Docker)
const hasAnthropicCredentials = !!process.env.ANTHROPIC_API_KEY && hasDockerSandbox;

describe.skipIf(!process.env.INTEGRATION_TEST)('integration tests', () => {
  beforeAll(() => {
    mkdirSync(TEST_DIR, { recursive: true });

    // Log sandbox backend info
    const sandboxInfo = getSandboxBackendInfo();
    console.log(`\nSandbox backend: ${sandboxInfo.description}`);
    console.log(`  Docker available: ${hasDockerSandbox}\n`);
  });

  afterAll(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe.skipIf(!hasDockerSandbox)('agent execution error propagation', () => {
    it('surfaces failure when API key is invalid', async () => {
      const fixtureDir = join(TEST_DIR, 'error-propagation-fixture');
      mkdirSync(join(fixtureDir, 'src'), { recursive: true });
      writeFileSync(join(fixtureDir, 'src/index.ts'), '// TODO: implement');

      const fixture: EvalFixture = {
        name: 'error-propagation-fixture',
        path: fixtureDir,
        prompt: 'Add a function that returns 42.',
      };

      const result = await runSingleEval(fixture, {
        agent: 'claude-code',
        model: 'sonnet',
        timeout: 60,
        apiKey: 'invalid-api-key-for-testing',
      });

      // The result must surface the agent failure — not silently succeed
      expect(result.result.status).toBe('failed');
      expect(result.result.error).toBeDefined();
      expect(result.result.duration).toBeGreaterThan(0);
      console.log('Agent error (expected):', result.result.error);
    }, 120_000); // 2 minute timeout
  });

  describe.skipIf(!hasAnthropicCredentials)('Claude Code sandbox execution', () => {
    it('can edit a SQL migration file inside the Docker sandbox', async () => {
      const fixtureDir = join(TEST_DIR, 'sql-migration');
      mkdirSync(join(fixtureDir, 'supabase/migrations'), { recursive: true });
      writeFileSync(
        join(fixtureDir, 'supabase/migrations/20240101000000_create_todos.sql'),
        '-- TODO: implement'
      );

      // Construct the fixture inline, prompt lives here not in a file
      const fixture: EvalFixture = {
        name: 'sql-migration',
        path: fixtureDir,
        prompt: [
          'Replace the placeholder comment in supabase/migrations/20240101000000_create_todos.sql',
          'with a CREATE TABLE statement for a `todos` table.',
          'The table must have: id (uuid primary key), title (text not null),',
          'completed (boolean not null default false).',
        ].join('\n'),
      };

      const result = await runSingleEval(fixture, {
        agent: 'claude-code',
        model: 'sonnet',
        timeout: 120,
        apiKey: process.env.ANTHROPIC_API_KEY!,
      });

      expect(result.result.duration).toBeGreaterThan(0);
      if (result.result.error) {
        console.error('Agent error:', result.result.error);
      }
      expect(result.result.error).toBeUndefined();

      const sql = (
        result.generatedFiles?.['supabase/migrations/20240101000000_create_todos.sql'] ?? ''
      ).toLowerCase();
      expect(sql).toContain('create table');
      expect(sql).toContain('todos');
      expect(sql).toContain('completed');
    }, 300_000); // 5 minute timeout
  });
});
