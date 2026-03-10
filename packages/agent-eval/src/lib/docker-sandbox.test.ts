/**
 * Integration tests for Docker sandbox.
 * These tests require Docker to be running.
 * Skip with: SKIP_DOCKER_TESTS=1 npm test
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { DockerSandboxManager } from './docker-sandbox.js';

// Check if Docker is available
async function isDockerAvailable(): Promise<boolean> {
  try {
    const { execSync } = await import('child_process');
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe('DockerSandboxManager', () => {
  const skipDocker = process.env.SKIP_DOCKER_TESTS === '1';
  let dockerAvailable = false;

  beforeAll(async () => {
    if (!skipDocker) {
      dockerAvailable = await isDockerAvailable();
    }
  });

  describe('when Docker is available', () => {
    it('can create and stop a sandbox', async () => {
      if (skipDocker || !dockerAvailable) {
        console.log('Skipping: Docker not available');
        return;
      }

      const sandbox = await DockerSandboxManager.create({
        timeout: 60000,
        runtime: 'node24',
      });

      expect(sandbox.sandboxId).toBeTruthy();
      expect(sandbox.getWorkingDirectory()).toMatch(/tmp\/sandbox-[a-z0-9]+/);

      await sandbox.stop();
    }, 120000); // 2 minute timeout for image pull

    it('can run commands', async () => {
      if (skipDocker || !dockerAvailable) {
        console.log('Skipping: Docker not available');
        return;
      }

      const sandbox = await DockerSandboxManager.create({
        timeout: 60000,
        runtime: 'node24',
      });

      try {
        const result = await sandbox.runCommand('echo', ['hello world']);
        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe('hello world');
      } finally {
        await sandbox.stop();
      }
    }, 120000);

    it('can write and read files', async () => {
      if (skipDocker || !dockerAvailable) {
        console.log('Skipping: Docker not available');
        return;
      }

      const sandbox = await DockerSandboxManager.create({
        timeout: 60000,
        runtime: 'node24',
      });

      try {
        await sandbox.writeFiles({
          'test.txt': 'Hello from test!',
          'nested/file.json': '{"key": "value"}',
        });

        const content1 = await sandbox.readFile('test.txt');
        expect(content1.trim()).toBe('Hello from test!');

        const content2 = await sandbox.readFile('nested/file.json');
        expect(JSON.parse(content2)).toEqual({ key: 'value' });
      } finally {
        await sandbox.stop();
      }
    }, 120000);

    it('can run npm commands', async () => {
      if (skipDocker || !dockerAvailable) {
        console.log('Skipping: Docker not available');
        return;
      }

      const sandbox = await DockerSandboxManager.create({
        timeout: 120000,
        runtime: 'node24',
      });

      try {
        // Create a minimal package.json
        await sandbox.writeFiles({
          'package.json': JSON.stringify({
            name: 'test-project',
            version: '1.0.0',
            type: 'module',
          }),
        });

        // Run npm install (should succeed even with no deps)
        const result = await sandbox.runCommand('npm', ['install']);
        expect(result.exitCode).toBe(0);

        // Check node version
        const nodeResult = await sandbox.runCommand('node', ['--version']);
        expect(nodeResult.exitCode).toBe(0);
        expect(nodeResult.stdout).toMatch(/^v2[04]/); // v20 or v24
      } finally {
        await sandbox.stop();
      }
    }, 180000); // 3 minute timeout

    it('returns correct exit codes for failed commands', async () => {
      if (skipDocker || !dockerAvailable) {
        console.log('Skipping: Docker not available');
        return;
      }

      const sandbox = await DockerSandboxManager.create({
        timeout: 60000,
        runtime: 'node24',
      });

      try {
        const result = await sandbox.runCommand('false'); // Always exits with 1
        expect(result.exitCode).toBe(1);
      } finally {
        await sandbox.stop();
      }
    }, 120000);

    it('can run shell commands', async () => {
      if (skipDocker || !dockerAvailable) {
        console.log('Skipping: Docker not available');
        return;
      }

      const sandbox = await DockerSandboxManager.create({
        timeout: 60000,
        runtime: 'node24',
      });

      try {
        const result = await sandbox.runShell('echo "hello" && echo "world"');
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('hello');
        expect(result.stdout).toContain('world');
      } finally {
        await sandbox.stop();
      }
    }, 120000);
  });
});
