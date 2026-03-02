/**
 * End-to-end integration tests for the eval framework.
 *
 * These tests require a valid Anthropic API key and Docker.
 * Run with: INTEGRATION_TEST=1 npm test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { config as dotenvConfig } from 'dotenv';
import { initProject } from './lib/init.js';
import { loadFixture, loadAllFixtures } from './lib/fixture.js';
import { runSingleEval } from './lib/runner.js';
import { loadConfig } from './lib/config.js';
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

  describe('project initialization', () => {
    // Create test project before all tests in this block
    beforeAll(() => {
      const projectDir = join(TEST_DIR, 'test-project');
      if (!existsSync(projectDir)) {
        initProject({
          name: 'test-project',
          targetDir: TEST_DIR,
        });
      }
    });

    it('creates a complete project structure', () => {
      const projectDir = join(TEST_DIR, 'test-project');

      // Verify structure
      expect(existsSync(join(projectDir, 'package.json'))).toBe(true);
      expect(existsSync(join(projectDir, 'experiments/cc.ts'))).toBe(true);
      expect(existsSync(join(projectDir, 'evals/add-greeting/PROMPT.md'))).toBe(true);
      expect(existsSync(join(projectDir, 'evals/add-greeting/EVAL.ts'))).toBe(true);
      expect(existsSync(join(projectDir, 'evals/add-greeting/package.json'))).toBe(true);

      // Verify package.json is valid
      const pkg = JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf-8'));
      expect(pkg.name).toBe('test-project');
      expect(pkg.type).toBe('module');
      expect(pkg.scripts?.eval).toContain('braintrust eval');
    });

    it('can load fixtures from generated project', () => {
      const projectDir = join(TEST_DIR, 'test-project');
      const evalsDir = join(projectDir, 'evals');

      const { fixtures, errors } = loadAllFixtures(evalsDir);

      expect(fixtures).toHaveLength(1);
      expect(errors).toHaveLength(0);
      expect(fixtures[0].name).toBe('add-greeting');
    });

    it('can load Claude Code experiment config from generated project', async () => {
      const projectDir = join(TEST_DIR, 'test-project');
      const configPath = join(projectDir, 'experiments/cc.ts');

      const config = await loadConfig(configPath);

      expect(config.agent).toBe('claude-code');
      expect(config.model).toBe('opus');
    });
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
