/**
 * Eval fixture discovery and validation.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import type { EvalFixture } from './types.js';
import { REQUIRED_EVAL_FILES, EXCLUDED_FILES } from './types.js';

/**
 * Error thrown when an eval fixture is invalid.
 */
export class FixtureValidationError extends Error {
  constructor(
    public fixtureName: string,
    message: string
  ) {
    super(`Eval "${fixtureName}": ${message}`);
    this.name = 'FixtureValidationError';
  }
}

/**
 * Discovers all eval fixtures in a directory.
 * Each subdirectory is considered a potential eval fixture.
 */
export function discoverFixtures(evalsDir: string): string[] {
  const absolutePath = resolve(evalsDir);

  if (!existsSync(absolutePath)) {
    throw new Error(`Evals directory not found: ${absolutePath}`);
  }

  const entries = readdirSync(absolutePath);
  const fixtures: string[] = [];

  for (const entry of entries) {
    const entryPath = join(absolutePath, entry);

    // Skip hidden directories and files
    if (entry.startsWith('.')) {
      continue;
    }

    // Only consider directories
    if (statSync(entryPath).isDirectory()) {
      fixtures.push(entry);
    }
  }

  return fixtures.sort();
}

/**
 * Validates that a fixture has all required files.
 * Returns an array of missing file names, or empty array if valid.
 * Note: Accepts either EVAL.ts or EVAL.tsx for the eval file.
 */
export function validateFixtureFiles(fixturePath: string): string[] {
  const missing: string[] = [];

  for (const file of REQUIRED_EVAL_FILES) {
    // Special case: Accept either EVAL.ts or EVAL.tsx
    if (file === 'EVAL.ts') {
      const hasEvalTs = existsSync(join(fixturePath, 'EVAL.ts'));
      const hasEvalTsx = existsSync(join(fixturePath, 'EVAL.tsx'));
      if (!hasEvalTs && !hasEvalTsx) {
        missing.push('EVAL.ts or EVAL.tsx');
      }
    } else {
      const filePath = join(fixturePath, file);
      if (!existsSync(filePath)) {
        missing.push(file);
      }
    }
  }

  return missing;
}

/**
 * Validates the package.json of a fixture.
 * Ensures it has "type": "module".
 */
export function validatePackageJson(fixturePath: string): { isModule: boolean; error?: string } {
  const packageJsonPath = join(fixturePath, 'package.json');

  try {
    const content = readFileSync(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(content);

    if (pkg.type !== 'module') {
      return {
        isModule: false,
        error: 'package.json must have "type": "module"',
      };
    }

    return { isModule: true };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        isModule: false,
        error: 'package.json is not valid JSON',
      };
    }
    throw error;
  }
}

/**
 * Loads a single eval fixture with full validation.
 */
export function loadFixture(evalsDir: string, name: string): EvalFixture {
  const fixturePath = resolve(evalsDir, name);

  if (!existsSync(fixturePath)) {
    throw new FixtureValidationError(name, `Directory not found: ${fixturePath}`);
  }

  // Validate required files
  const missingFiles = validateFixtureFiles(fixturePath);
  if (missingFiles.length > 0) {
    throw new FixtureValidationError(
      name,
      `Missing required files: ${missingFiles.join(', ')}`
    );
  }

  // Validate package.json
  const pkgValidation = validatePackageJson(fixturePath);
  if (pkgValidation.error) {
    throw new FixtureValidationError(name, pkgValidation.error);
  }

  // Read prompt
  const promptPath = join(fixturePath, 'PROMPT.md');
  const prompt = readFileSync(promptPath, 'utf-8');

  return {
    name,
    path: fixturePath,
    prompt,
    isModule: pkgValidation.isModule,
  };
}

/**
 * Discovers and loads all valid eval fixtures from a directory.
 * Returns both valid fixtures and any validation errors encountered.
 */
export function loadAllFixtures(evalsDir: string): {
  fixtures: EvalFixture[];
  errors: FixtureValidationError[];
} {
  const fixtureNames = discoverFixtures(evalsDir);
  const fixtures: EvalFixture[] = [];
  const errors: FixtureValidationError[] = [];

  for (const name of fixtureNames) {
    try {
      const fixture = loadFixture(evalsDir, name);
      fixtures.push(fixture);
    } catch (error) {
      if (error instanceof FixtureValidationError) {
        errors.push(error);
      } else {
        throw error;
      }
    }
  }

  return { fixtures, errors };
}

/**
 * Gets a list of all files in a fixture directory.
 * Excludes PROMPT.md, EVAL.ts, node_modules, and .git.
 */
export function getFixtureFiles(
  fixturePath: string,
  excludePatterns: readonly string[] = EXCLUDED_FILES
): string[] {
  const files: string[] = [];

  function walk(dir: string, basePath: string = '') {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const relativePath = basePath ? `${basePath}/${entry}` : entry;

      // Check if should be excluded
      if (excludePatterns.some((pattern) => relativePath === pattern || entry === pattern)) {
        continue;
      }

      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        walk(fullPath, relativePath);
      } else {
        files.push(relativePath);
      }
    }
  }

  walk(fixturePath);
  return files.sort();
}

/**
 * Reads all fixture files into a map.
 * Keys are relative paths, values are file contents.
 */
export function readFixtureFiles(
  fixturePath: string,
  excludePatterns?: readonly string[]
): Map<string, string> {
  const files = getFixtureFiles(fixturePath, excludePatterns);
  const contents = new Map<string, string>();

  for (const file of files) {
    const fullPath = join(fixturePath, file);
    contents.set(file, readFileSync(fullPath, 'utf-8'));
  }

  return contents;
}
