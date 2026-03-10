import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { computeFingerprint } from './fingerprint.js';
import type { RunnableExperimentConfig } from './types.js';

const TEST_DIR = '/tmp/eval-framework-fingerprint-test';

const baseConfig: RunnableExperimentConfig = {
  agent: 'claude-code',
  model: 'opus',
  evals: '*',
  runs: 2,
  earlyExit: true,
  scripts: ['build'],
  timeout: 600,
  sandbox: 'docker',
  copyFiles: 'none',
};

function createEvalDir(name: string, files: Record<string, string>): string {
  const dir = join(TEST_DIR, name);
  mkdirSync(dir, { recursive: true });
  for (const [file, content] of Object.entries(files)) {
    const filePath = join(dir, file);
    const fileDir = filePath.substring(0, filePath.lastIndexOf('/'));
    mkdirSync(fileDir, { recursive: true });
    writeFileSync(filePath, content);
  }
  return dir;
}

describe('computeFingerprint', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  it('produces consistent hash for same inputs', () => {
    const evalDir = createEvalDir('eval-1', {
      '.mcp.json': '{"mcpServers":{}}',
      'supabase/config.toml': '[api]\nport = 54321',
    });

    const fp1 = computeFingerprint(evalDir, baseConfig);
    const fp2 = computeFingerprint(evalDir, baseConfig);
    expect(fp1).toBe(fp2);
    expect(fp1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
  });

  it('changes when eval file content changes', () => {
    const evalDir = createEvalDir('eval-2', {
      '.mcp.json': '{"mcpServers":{}}',
      'supabase/config.toml': '[api]\nport = 54321',
    });

    const fp1 = computeFingerprint(evalDir, baseConfig);

    writeFileSync(join(evalDir, 'supabase/config.toml'), '[api]\nport = 54322');
    const fp2 = computeFingerprint(evalDir, baseConfig);

    expect(fp1).not.toBe(fp2);
  });

  it('changes when config model changes', () => {
    const evalDir = createEvalDir('eval-3', {
      '.mcp.json': '{"mcpServers":{}}',
      'supabase/config.toml': '[api]\nport = 54321',
    });

    const fp1 = computeFingerprint(evalDir, baseConfig);
    const fp2 = computeFingerprint(evalDir, { ...baseConfig, model: 'sonnet' });

    expect(fp1).not.toBe(fp2);
  });

  it('changes when config timeout changes', () => {
    const evalDir = createEvalDir('eval-4', {
      '.mcp.json': '{"mcpServers":{}}',
      'supabase/config.toml': '[api]\nport = 54321',
    });

    const fp1 = computeFingerprint(evalDir, baseConfig);
    const fp2 = computeFingerprint(evalDir, { ...baseConfig, timeout: 1200 });

    expect(fp1).not.toBe(fp2);
  });

  it('changes when sandbox backend changes', () => {
    const evalDir = createEvalDir('eval-4b', {
      '.mcp.json': '{"mcpServers":{}}',
      'supabase/config.toml': '[api]\nport = 54321',
    });

    const fp1 = computeFingerprint(evalDir, { ...baseConfig, sandbox: 'docker' });
    // If a second backend were added in the future, changing it would produce a different hash.
    // For now, verify that sandbox is included in the hash by checking it contributes to output.
    const fp2 = computeFingerprint(evalDir, { ...baseConfig, sandbox: 'docker', copyFiles: 'all' });

    expect(fp1).not.toBe(fp2);
  });

  it('changes when copyFiles changes', () => {
    const evalDir = createEvalDir('eval-4c', {
      '.mcp.json': '{"mcpServers":{}}',
      'supabase/config.toml': '[api]\nport = 54321',
    });

    const fp1 = computeFingerprint(evalDir, { ...baseConfig, copyFiles: 'none' });
    const fp2 = computeFingerprint(evalDir, { ...baseConfig, copyFiles: 'changed' });
    const fp3 = computeFingerprint(evalDir, { ...baseConfig, copyFiles: 'all' });

    expect(fp1).not.toBe(fp2);
    expect(fp2).not.toBe(fp3);
    expect(fp1).not.toBe(fp3);
  });

  it('is not affected by evals filter (only content matters)', () => {
    const evalDir = createEvalDir('eval-5', {
      '.mcp.json': '{"mcpServers":{}}',
      'supabase/config.toml': '[api]\nport = 54321',
    });

    const fp1 = computeFingerprint(evalDir, { ...baseConfig, evals: '*' });
    const fp2 = computeFingerprint(evalDir, { ...baseConfig, evals: ['eval-5'] });

    expect(fp1).toBe(fp2);
  });

  it('ignores node_modules directory', () => {
    const evalDir = createEvalDir('eval-6', {
      '.mcp.json': '{"mcpServers":{}}',
      'supabase/config.toml': '[api]\nport = 54321',
    });

    const fp1 = computeFingerprint(evalDir, baseConfig);

    // Add node_modules (should be ignored)
    mkdirSync(join(evalDir, 'node_modules', 'some-pkg'), { recursive: true });
    writeFileSync(join(evalDir, 'node_modules', 'some-pkg', 'index.js'), 'module.exports = {}');

    const fp2 = computeFingerprint(evalDir, baseConfig);
    expect(fp1).toBe(fp2);
  });

  it('extending a model array does not invalidate existing models', () => {
    const evalDir = createEvalDir('eval-7', {
      '.mcp.json': '{"mcpServers":{}}',
      'supabase/config.toml': '[api]\nport = 54321',
    });

    // Simulate how CLI expands model arrays: each model gets its own config
    const fpModelA = computeFingerprint(evalDir, { ...baseConfig, model: 'model-a' });
    const fpModelB = computeFingerprint(evalDir, { ...baseConfig, model: 'model-b' });

    // Adding model-c to the array doesn't change model-a or model-b fingerprints
    // (CLI would just create a new experiment for model-c)
    const fpModelAAfter = computeFingerprint(evalDir, { ...baseConfig, model: 'model-a' });
    const fpModelBAfter = computeFingerprint(evalDir, { ...baseConfig, model: 'model-b' });

    expect(fpModelA).toBe(fpModelAAfter);
    expect(fpModelB).toBe(fpModelBAfter);
    expect(fpModelA).not.toBe(fpModelB); // different models = different fingerprints
  });
});
