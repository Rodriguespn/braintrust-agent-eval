/**
 * Claude Code agent implementation.
 * Uses direct Anthropic API for model access.
 */

import type { Agent, AgentRunOptions, AgentRunResult } from './types.js';
import type { ModelTier } from '../types.js';
import {
  createSandbox,
  collectLocalFiles,
  splitTestFiles,
  verifyNoTestFiles,
} from '../sandbox.js';
import type { DockerSandboxManager } from '../docker-sandbox.js';
import {
  runScripts,
  captureGeneratedFiles,
  ANTHROPIC_DIRECT,
  initGitAndCommit,
} from './shared.js';

/**
 * Capture the Claude Code transcript from the sandbox.
 * Claude Code stores transcripts at ~/.claude/projects/-{workdir}/{session-id}.jsonl
 */
async function captureTranscript(sandbox: DockerSandboxManager): Promise<string | undefined> {
  try {
    // Get the working directory to construct the transcript path
    const workdir = sandbox.getWorkingDirectory();
    // Claude Code uses the path with slashes replaced by dashes
    const projectPath = workdir.replace(/\//g, '-');
    const claudeProjectDir = `~/.claude/projects/${projectPath}`;

    // Find the most recent .jsonl file (the transcript)
    const findResult = await sandbox.runShell(
      `ls -t ${claudeProjectDir}/*.jsonl 2>/dev/null | head -1`
    );

    if (findResult.exitCode !== 0 || !findResult.stdout.trim()) {
      return undefined;
    }

    const transcriptPath = findResult.stdout.trim();
    const content = await sandbox.readFile(transcriptPath);
    return content || undefined;
  } catch {
    // Transcript capture is best-effort
    return undefined;
  }
}

/**
 * Create Claude Code agent using direct Anthropic API.
 */
export function createClaudeCodeAgent(): Agent {
  return {
    name: 'claude-code',
    displayName: 'Claude Code',

    getApiKeyEnvVar(): string {
      return ANTHROPIC_DIRECT.apiKeyEnvVar;
    },

    getDefaultModel(): ModelTier {
      return 'opus';
    },

    async run(fixturePath: string, options: AgentRunOptions): Promise<AgentRunResult> {
    const startTime = Date.now();
    let sandbox: DockerSandboxManager | null = null;
    let agentOutput = '';
    let transcript: string | undefined;
    let aborted = false;
    let sandboxStopped = false;
    let hasReturned = false;

    const captureTranscriptBestEffort = async () => {
      if (!sandbox || sandboxStopped || transcript) return;
      transcript = await captureTranscript(sandbox);
    };

    // Handle abort signal
    const abortHandler = () => {
      aborted = true;
      if (sandbox && !sandboxStopped) {
        sandboxStopped = true;
        sandbox.stop().catch(() => {});
      }
    };

    if (options.signal) {
      if (options.signal.aborted) {
          hasReturned = true;
        return {
          success: false,
          output: '',
          error: 'Aborted before start',
          duration: 0,
        };
      }
      options.signal.addEventListener('abort', abortHandler);
    }

    try {
      // Collect files from fixture
      const allFiles = await collectLocalFiles(fixturePath);
      const { workspaceFiles } = splitTestFiles(allFiles);

      // Check for abort before expensive operations
      if (aborted) {
        hasReturned = true;
        return {
          success: false,
          output: '',
          error: 'Aborted',
          duration: Date.now() - startTime,
        };
      }

      // Phase: sandbox:setup
      let phaseStart = Date.now();
      options.onPhase?.('sandbox:setup', 'start');

      // Create sandbox
      sandbox = await createSandbox({
        timeout: options.timeout,
        runtime: 'node24',
        backend: options.sandbox,
      });

      // Check for abort after sandbox creation (abort may have fired during create)
      if (aborted) {
        options.onPhase?.('sandbox:setup', 'end', Date.now() - phaseStart);
        hasReturned = true;
        return {
          success: false,
          output: '',
          error: 'Aborted',
          duration: Date.now() - startTime,
          sandboxId: sandbox.sandboxId,
        };
      }

      // Upload workspace files (excluding tests)
      await sandbox.uploadFiles(workspaceFiles);

	  await initGitAndCommit(sandbox);

      // Run setup function if provided
      if (options.setup) {
        await options.setup(sandbox);
      }

      options.onPhase?.('sandbox:setup', 'end', Date.now() - phaseStart);

      // Phase: sandbox:npm-install
      phaseStart = Date.now();
      options.onPhase?.('sandbox:npm-install', 'start');

      // Install dependencies
      let installResult = await sandbox.runCommand('npm', ['install']);
      if (installResult.exitCode !== 0) {
        installResult = await sandbox.runCommand('npm', ['install']);
      }
      if (installResult.exitCode !== 0) {
        const output = (installResult.stdout + installResult.stderr).trim().split('\n').slice(-10).join('\n');
        throw new Error(`npm install failed (exit code ${installResult.exitCode}):\n${output}`);
      }

      // Install Claude Code CLI globally
      const cliInstall = await sandbox.runCommand('npm', [
        'install',
        '-g',
        '@anthropic-ai/claude-code',
      ]);
      if (cliInstall.exitCode !== 0) {
        throw new Error(`Claude Code install failed: ${cliInstall.stderr}`);
      }

      options.onPhase?.('sandbox:npm-install', 'end', Date.now() - phaseStart);

      // Verify no test files in sandbox
      await verifyNoTestFiles(sandbox);

      // Phase: agent:run
      phaseStart = Date.now();
      options.onPhase?.('agent:run', 'start');

      // Run Claude Code with direct Anthropic API
      const claudeResult = await sandbox.runCommand(
        'claude',
        ['--print', '--model', options.model, '--dangerously-skip-permissions', options.prompt],
        {
          env: {
            ANTHROPIC_API_KEY: options.apiKey,
          },
        }
      );

      agentOutput = claudeResult.stdout + claudeResult.stderr;

      if (claudeResult.exitCode !== 0) {
        await captureTranscriptBestEffort();
        options.onPhase?.('agent:run', 'end', Date.now() - phaseStart);
        // Extract meaningful error from output (last few lines usually contain the error)
        const errorLines = agentOutput.trim().split('\n').slice(-5).join('\n');
        hasReturned = true;
        return {
          success: false,
          output: agentOutput,
          transcript,
          error: errorLines || `Claude Code exited with code ${claudeResult.exitCode}`,
          duration: Date.now() - startTime,
          sandboxId: sandbox.sandboxId,
        };
      }

      // Capture transcript before running scripts
      await captureTranscriptBestEffort();

      options.onPhase?.('agent:run', 'end', Date.now() - phaseStart);

      // Phase: scripts (only if scripts are configured)
      const scripts = options.scripts ?? [];
      if (scripts.length > 0) {
        phaseStart = Date.now();
        options.onPhase?.('scripts', 'start');
      }

      // Run configured npm scripts (build, lint, etc.)
      const scriptsResult = await runScripts(sandbox, scripts);

      if (scripts.length > 0) {
        options.onPhase?.('scripts', 'end', Date.now() - phaseStart);
      }

      // Capture generated files
      const { generatedFiles, deletedFiles } = await captureGeneratedFiles(sandbox);

      hasReturned = true;
      return {
        success: scriptsResult.allPassed,
        output: agentOutput,
        transcript,
        duration: Date.now() - startTime,
        scriptsResults: scriptsResult.scripts,
        sandboxId: sandbox.sandboxId,
        generatedFiles,
        deletedFiles,
      };
    } catch (error) {
      await captureTranscriptBestEffort();
      // Check if this was an abort
      if (aborted) {
        hasReturned = true;
        return {
          success: false,
          output: agentOutput,
          transcript,
          error: 'Aborted',
          duration: Date.now() - startTime,
          sandboxId: sandbox?.sandboxId,
        };
      }
      hasReturned = true;
      return {
        success: false,
        output: agentOutput,
        transcript,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        sandboxId: sandbox?.sandboxId,
      };
    } finally {
      // If we're about to return and sandbox is still up, try one final transcript capture.
      if (hasReturned) {
        await captureTranscriptBestEffort();
      }
      // Clean up abort listener
      if (options.signal) {
        options.signal.removeEventListener('abort', abortHandler);
      }
      if (sandbox && !sandboxStopped) {
        sandboxStopped = true;
        await sandbox.stop();
      }
    }
  },
};
}
