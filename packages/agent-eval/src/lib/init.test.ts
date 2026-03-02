import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { initProject, getPostInitInstructions } from './init.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '../..');

const TEST_DIR = '/tmp/eval-framework-init-test';

describe('init utilities', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe('initProject', () => {
    it('creates project directory structure', () => {
      const projectDir = initProject({
        name: 'my-evals',
        targetDir: TEST_DIR,
      });

      expect(existsSync(projectDir)).toBe(true);
      expect(existsSync(join(projectDir, 'package.json'))).toBe(true);
      expect(existsSync(join(projectDir, '.env.example'))).toBe(true);
      expect(existsSync(join(projectDir, '.gitignore'))).toBe(true);
      expect(existsSync(join(projectDir, 'experiments'))).toBe(true);
      expect(existsSync(join(projectDir, 'evals'))).toBe(true);
    });

    it('creates Claude Code experiment config', () => {
      const projectDir = initProject({
        name: 'test-project',
        targetDir: TEST_DIR,
      });

      const configPath = join(projectDir, 'experiments/cc.ts');
      expect(existsSync(configPath)).toBe(true);

      const content = readFileSync(configPath, 'utf-8');
      expect(content).toContain("agent: 'claude-code'");
    });

    it('creates example eval fixture', () => {
      const projectDir = initProject({
        name: 'test-project',
        targetDir: TEST_DIR,
      });

      const evalDir = join(projectDir, 'evals/add-greeting');
      expect(existsSync(evalDir)).toBe(true);
      expect(existsSync(join(evalDir, 'PROMPT.md'))).toBe(true);
      expect(existsSync(join(evalDir, 'EVAL.ts'))).toBe(true);
      expect(existsSync(join(evalDir, 'package.json'))).toBe(true);
      expect(existsSync(join(evalDir, 'src/App.tsx'))).toBe(true);
    });

    it('creates valid package.json with correct name', () => {
      const projectDir = initProject({
        name: 'custom-name',
        targetDir: TEST_DIR,
      });

      const pkgPath = join(projectDir, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      expect(pkg.name).toBe('custom-name');
      expect(pkg.type).toBe('module');
      expect(pkg.scripts?.eval).toContain('braintrust eval');
    });

    it('creates eval fixture with type: module', () => {
      const projectDir = initProject({
        name: 'test-project',
        targetDir: TEST_DIR,
      });

      const evalPkgPath = join(projectDir, 'evals/add-greeting/package.json');
      const pkg = JSON.parse(readFileSync(evalPkgPath, 'utf-8'));

      expect(pkg.type).toBe('module');
    });

    it('throws if directory already exists', () => {
      // Create the directory first
      mkdirSync(join(TEST_DIR, 'existing-project'));

      expect(() =>
        initProject({
          name: 'existing-project',
          targetDir: TEST_DIR,
        })
      ).toThrow('Directory already exists');
    });

    it('creates .env.example with required variables', () => {
      const projectDir = initProject({
        name: 'test-project',
        targetDir: TEST_DIR,
      });

      const envPath = join(projectDir, '.env.example');
      const content = readFileSync(envPath, 'utf-8');

      expect(content).toContain('ANTHROPIC_API_KEY');
    });

    it('creates .gitignore with common patterns', () => {
      const projectDir = initProject({
        name: 'test-project',
        targetDir: TEST_DIR,
      });

      const gitignorePath = join(projectDir, '.gitignore');
      const content = readFileSync(gitignorePath, 'utf-8');

      expect(content).toContain('node_modules');
      expect(content).toContain('.env');
      expect(content).toContain('results/');
    });

    it('passes TypeScript type checking after npm install', { timeout: 120000 }, () => {
      const projectDir = initProject({
        name: 'typecheck-test',
        targetDir: TEST_DIR,
      });

      // For testing, link the local package instead of downloading from npm
      // This allows the test to work before publishing
      const pkgPath = join(projectDir, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      pkg.devDependencies['@supabase/agent-evals'] = `file:${PROJECT_ROOT}`;
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

      // Install dependencies
      execSync('npm install', {
        cwd: projectDir,
        stdio: 'pipe',
      });

      // Run type checker - this should pass without errors
      // This catches issues like missing @types/node, vitest types, etc.
      execSync('npx tsc --noEmit', {
        cwd: projectDir,
        stdio: 'pipe',
      });
    });
  });

  describe('getPostInitInstructions', () => {
    it('returns instructions with project path', () => {
      const instructions = getPostInitInstructions('/path/to/project', 'my-project');

      expect(instructions).toContain('/path/to/project');
      expect(instructions).toContain('cd my-project');
      expect(instructions).toContain('npm install');
    });
  });
});
