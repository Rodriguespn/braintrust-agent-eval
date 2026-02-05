import { describe, it, expect } from 'vitest';
import {
  validateConfig,
  resolveConfig,
  resolveEvalNames,
  CONFIG_DEFAULTS,
} from './config.js';

describe('validateConfig', () => {
  it('accepts valid minimal config', () => {
    const config = { agent: 'claude-code' };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('accepts valid full config', () => {
    const config = {
      agent: 'claude-code',
      model: 'opus',
      evals: ['eval-1', 'eval-2'],
      runs: 5,
      earlyExit: false,
      scripts: ['build', 'lint'],
      timeout: 600,
    };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('accepts array of models', () => {
    const config = {
      agent: 'claude-code',
      model: ['opus', 'sonnet', 'haiku'],
    };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('accepts function evals filter', () => {
    const config = {
      agent: 'claude-code',
      evals: (name: string) => name.startsWith('auth-'),
    };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('rejects invalid agent', () => {
    const config = { agent: 'invalid-agent' };
    expect(() => validateConfig(config)).toThrow('Invalid experiment configuration');
  });

  it('rejects non-positive runs', () => {
    const config = { agent: 'claude-code', runs: 0 };
    expect(() => validateConfig(config)).toThrow('Invalid experiment configuration');
  });
});

describe('resolveConfig', () => {
  it('applies defaults for minimal config', () => {
    const config = { agent: 'claude-code' as const };
    const resolved = resolveConfig(config);

    expect(resolved.agent).toBe('claude-code');
    expect(resolved.model).toBe('opus');
    expect(resolved.runs).toBe(CONFIG_DEFAULTS.runs);
    expect(resolved.earlyExit).toBe(CONFIG_DEFAULTS.earlyExit);
    expect(resolved.evals).toBe('*');
  });

  it('preserves provided values', () => {
    const config = {
      agent: 'claude-code' as const,
      model: 'haiku' as const,
      runs: 10,
      earlyExit: false,
    };
    const resolved = resolveConfig(config);

    expect(resolved.model).toBe('haiku');
    expect(resolved.runs).toBe(10);
    expect(resolved.earlyExit).toBe(false);
  });
});

describe('resolveEvalNames', () => {
  const availableEvals = ['auth-login', 'auth-logout', 'ui-button', 'api-endpoint'];

  it('returns all evals for "*" filter', () => {
    const result = resolveEvalNames('*', availableEvals);
    expect(result).toEqual(availableEvals);
  });

  it('returns single eval for string filter', () => {
    const result = resolveEvalNames('auth-login', availableEvals);
    expect(result).toEqual(['auth-login']);
  });

  it('filters evals with function', () => {
    const result = resolveEvalNames((name) => name.startsWith('auth-'), availableEvals);
    expect(result).toEqual(['auth-login', 'auth-logout']);
  });

  it('throws for non-existent single eval', () => {
    expect(() => resolveEvalNames('non-existent', availableEvals)).toThrow(
      'Eval "non-existent" not found'
    );
  });
});
