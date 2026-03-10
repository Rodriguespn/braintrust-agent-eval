/**
 * Sandbox integration for isolated eval execution.
 * Uses Docker backend exclusively.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { DockerSandboxManager } from './docker-sandbox.js';

/**
 * Default timeout for sandbox operations (10 minutes).
 */
export const DEFAULT_SANDBOX_TIMEOUT = 600000;

/**
 * Supported sandbox backends.
 */
export type SandboxBackend = 'docker';

/**
 * Information about the sandbox backend.
 */
export interface SandboxBackendInfo {
  /** Which backend will be used */
  backend: SandboxBackend;
  /** How it was determined */
  reason: 'explicit' | 'auto-detected';
  /** Human-readable description */
  description: string;
}

/**
 * Files to ignore when copying to sandbox.
 * These are build artifacts and dependencies that shouldn't be uploaded.
 */
export const IGNORED_PATTERNS = [
  '.git',
  '.next',
  'node_modules',
  '.DS_Store',
  '*.log',
  'build',
  'dist',
  'pnpm-lock.yaml',
  'package-lock.json',
];

/**
 * Options for creating a sandbox.
 */
export interface SandboxOptions {
  /** Timeout in milliseconds */
  timeout?: number;
  /** Runtime environment */
  runtime?: 'node20' | 'node24';
  /** Sandbox backend to use. @default 'docker' */
  backend?: SandboxBackend;
  /** Linux capabilities to add to the container (e.g. ['NET_ADMIN']) */
  capAdd?: string[];
  /** Kernel sysctls to set on the container (e.g. { 'net.ipv4.ip_forward': '1' }) */
  sysctls?: Record<string, string>;
  /** Docker network mode (e.g. 'host' to share host network namespace) */
  networkMode?: string;
}

/**
 * Result of running a command in the sandbox.
 */
export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * File to upload to sandbox.
 */
export interface SandboxFile {
  path: string;
  content: Buffer | string;
}

/**
 * Get information about the sandbox backend that will be used.
 * Useful for displaying to users.
 */
export function getSandboxBackendInfo(_options?: SandboxOptions): SandboxBackendInfo {
  return {
    backend: 'docker',
    reason: 'explicit',
    description: 'docker',
  };
}

/**
 * Create a sandbox using the Docker backend.
 *
 * @example
 * ```typescript
 * const sandbox = await createSandbox();
 * const sandbox = await createSandbox({ backend: 'docker' });
 * ```
 */
export async function createSandbox(
  options: SandboxOptions = {}
): Promise<DockerSandboxManager> {
  return DockerSandboxManager.create({
    timeout: options.timeout,
    runtime: options.runtime,
    capAdd: options.capAdd,
    sysctls: options.sysctls,
    networkMode: options.networkMode,
  });
}

/**
 * Collect files from a local directory for uploading to sandbox.
 */
export async function collectLocalFiles(
  dir: string,
  options: {
    excludePatterns?: string[];
    includePatterns?: string[];
  } = {}
): Promise<SandboxFile[]> {
  const { readdirSync, statSync } = await import('fs');

  const excludePatterns = options.excludePatterns ?? IGNORED_PATTERNS;
  const includePatterns = options.includePatterns;
  const files: SandboxFile[] = [];

  function shouldExclude(name: string, relativePath: string): boolean {
    for (const pattern of excludePatterns) {
      if (pattern.startsWith('*.')) {
        // Wildcard pattern
        const ext = pattern.slice(1);
        if (name.endsWith(ext)) {
          return true;
        }
      } else if (name === pattern || relativePath === pattern) {
        return true;
      }
    }
    return false;
  }

  function shouldInclude(name: string): boolean {
    if (!includePatterns) {
      return true;
    }
    for (const pattern of includePatterns) {
      if (pattern.startsWith('*.')) {
        const ext = pattern.slice(1);
        if (name.endsWith(ext)) {
          return true;
        }
      } else if (name === pattern) {
        return true;
      }
    }
    return false;
  }

  function walk(currentDir: string, relativePath: string = '') {
    const entries = readdirSync(currentDir);

    for (const entry of entries) {
      const entryRelativePath = relativePath ? `${relativePath}/${entry}` : entry;
      const fullPath = join(currentDir, entry);

      if (shouldExclude(entry, entryRelativePath)) {
        continue;
      }

      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        walk(fullPath, entryRelativePath);
      } else if (shouldInclude(entry)) {
        const content = readFileSync(fullPath);
        files.push({ path: entryRelativePath, content });
      }
    }
  }

  walk(dir);
  return files;
}

// Keep SandboxManager as an alias for DockerSandboxManager for backwards compatibility
export { DockerSandboxManager as SandboxManager };
