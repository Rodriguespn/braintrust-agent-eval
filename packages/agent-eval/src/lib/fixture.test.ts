import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import {
  getFixtureFiles,
  readFixtureFiles,
} from './fixture.js';

const TEST_DIR = '/tmp/eval-framework-test-fixtures';

function createTestFixture(name: string, files: Record<string, string>) {
  const fixturePath = join(TEST_DIR, name);
  mkdirSync(fixturePath, { recursive: true });

  for (const [filename, content] of Object.entries(files)) {
    const filePath = join(fixturePath, filename);
    const dir = join(filePath, '..');
    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, content);
  }

  return fixturePath;
}

describe('fixture utilities', () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe('getFixtureFiles', () => {
    it('lists all files excluding node_modules and .git', () => {
      createTestFixture('full', {
        'package.json': '{}',
        'src/App.tsx': 'app code',
        'node_modules/pkg/index.js': 'module code',
      });

      const path = join(TEST_DIR, 'full');
      const files = getFixtureFiles(path);

      expect(files).toContain('src/App.tsx');
      expect(files).toContain('package.json');
      expect(files).not.toContain('node_modules/pkg/index.js');
    });
  });

  describe('readFixtureFiles', () => {
    it('reads file contents into map excluding node_modules', () => {
      createTestFixture('readable', {
        'package.json': '{"name":"test"}',
        'src/index.ts': 'export const x = 1;',
      });

      const path = join(TEST_DIR, 'readable');
      const contents = readFixtureFiles(path);

      expect(contents.get('package.json')).toBe('{"name":"test"}');
      expect(contents.get('src/index.ts')).toBe('export const x = 1;');
    });
  });
});
