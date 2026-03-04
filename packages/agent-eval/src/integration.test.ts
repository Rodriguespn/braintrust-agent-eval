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
import { loadFixture } from './lib/fixture.js';
import { runSingleEval } from './lib/runner.js';
import { getSandboxBackendInfo } from './lib/sandbox.js';

// Load .env file (try .env.local first, then .env)
dotenvConfig({ path: '.env.local' });
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

  describe.skipIf(!hasAnthropicCredentials)('Claude Code sandbox execution', () => {
    it('can run a simple eval with Claude Code', async () => {
      // Create a simple test fixture
      const fixtureDir = join(TEST_DIR, 'simple-eval-claude');
      mkdirSync(join(fixtureDir, 'src'), { recursive: true });

      writeFileSync(
        join(fixtureDir, 'PROMPT.md'),
        'Add a function called greet that returns "Hello!"'
      );
      writeFileSync(
        join(fixtureDir, 'EVAL.ts'),
        `export default function check(files: Record<string, string>): boolean {
  return (files['src/index.ts'] ?? '').includes('greet');
}
`
      );
      writeFileSync(
        join(fixtureDir, 'package.json'),
        JSON.stringify({
          name: 'simple-eval-claude',
          type: 'module',
          scripts: { build: 'tsc' },
          devDependencies: { typescript: '^5.0.0' },
        })
      );
      writeFileSync(
        join(fixtureDir, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            target: 'ES2020',
            module: 'ESNext',
            moduleResolution: 'bundler',
            outDir: 'dist',
          },
          include: ['src'],
        })
      );
      writeFileSync(join(fixtureDir, 'src/index.ts'), '// TODO: implement');

      const fixture = loadFixture(TEST_DIR, 'simple-eval-claude');

      const result = await runSingleEval(fixture, {
        agent: 'claude-code',
        model: 'sonnet',
        timeout: 120,
        apiKey: process.env.ANTHROPIC_API_KEY!,
        scripts: ['build'],
      });

      // Verify the agent ran and produced output
      expect(result.result.duration).toBeGreaterThan(0);
      if (result.result.error) {
        console.error('Agent error:', result.result.error);
      }
      expect(result.result.error).toBeUndefined();

      // Verify the agent generated files with the expected content (host-side check)
      expect(result.generatedFiles).toBeDefined();
      const indexContent = result.generatedFiles?.['src/index.ts'] ?? '';
      expect(indexContent).toContain('greet');
    }, 300000); // 5 minute timeout
  });
});
