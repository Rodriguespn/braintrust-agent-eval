/**
 * Eval fixture utilities.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { EXCLUDED_FILES } from './types.js';

/**
 * Gets a list of all files in a fixture directory.
 * Excludes dev dependencies (see EXCLUDED_FILES).
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
