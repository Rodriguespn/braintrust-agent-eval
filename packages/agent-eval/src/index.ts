/**
 * agent-eval
 *
 * Framework for testing AI coding agents in isolated sandboxes.
 */

// Re-export types
export type {
  AgentType,
  ModelTier,
  EvalFilter,
  Sandbox,
  SetupFunction,
  TeardownFunction,
  ExperimentConfig,
  ResolvedExperimentConfig,
  EvalFixture,
  EvalRunResult,
  EvalRunData,
  EvalSummary,
  ProgressEvent,
  ExperimentResults,
  FailureType,
  Classification,
} from './lib/types.js';

// Re-export constants
export { EXCLUDED_FILES } from './lib/types.js';

// Re-export config utilities
export {
  CONFIG_DEFAULTS,
  validateConfig,
  resolveConfig,
  loadConfig,
  resolveEvalNames,
} from './lib/config.js';

// Re-export fixture utilities
export {
  getFixtureFiles,
  readFixtureFiles,
} from './lib/fixture.js';

// Re-export sandbox utilities
export type {
  SandboxOptions,
  CommandResult,
  SandboxFile,
  SandboxBackend,
  SandboxBackendInfo,
} from './lib/sandbox.js';
export {
  SandboxManager,
  DEFAULT_SANDBOX_TIMEOUT,
  IGNORED_PATTERNS,
  collectLocalFiles,
  createSandbox,
  getSandboxBackendInfo,
} from './lib/sandbox.js';

// Re-export Docker sandbox
export type { DockerSandboxOptions } from './lib/docker-sandbox.js';
export { DockerSandboxManager } from './lib/docker-sandbox.js';

// Re-export Supabase sandbox setup
export type { PrestartSupabaseProjectOptions } from './lib/supabase-sandbox.js';
export {
  setupSupabaseSandbox,
  teardownSupabaseSandbox,
  prestartSupabaseProject,
} from './lib/supabase-sandbox.js';

// Re-export agent utilities
export type { AgentRunOptions, AgentRunResult, AgentAdapter } from './lib/agents/types.js';

// Re-export agent registry
export type { Agent, ScriptResult } from './lib/agents/types.js';
export { getAgent, listAgents, registerAgent, getAgentAdapter } from './lib/agents/index.js';


// Re-export results utilities
export type { SaveResultsOptions, ReusableResult } from './lib/results.js';
export {
  agentResultToEvalRunData,
  createEvalSummary,
  createExperimentResults,
  saveResults,
  formatResultsTable,
  formatRunResult,
  createProgressDisplay,
  scanReusableResults,
} from './lib/results.js';

// Re-export fingerprinting
export { computeFingerprint } from './lib/fingerprint.js';

// Re-export classifier
export {
  isClassifierEnabled,
  classifyFailure,
  classifyWithAI,
  isNonModelFailure,
} from './lib/classifier.js';

// Re-export runner utilities
export { runSingleEval } from './lib/runner.js';

// Re-export Braintrust integration
export type { BraintrustUploadOptions, EvalCheckFn, AgentEvalScorer } from './lib/braintrust.js';
export {
  createAgentTask,
  builtinScorers,
  pushFixturesToDataset,
  uploadExperimentToBraintrust,
} from './lib/braintrust.js';

// Re-export o11y (observability) utilities
export type {
  ToolName,
  TranscriptEvent,
  WebFetchInfo,
  FileOperationInfo,
  ShellCommandInfo,
  TranscriptSummary,
  Transcript,
  ParseableAgent,
} from './lib/o11y/index.js';
export {
  parseTranscript,
  parseTranscriptSummary,
  loadTranscript,
  SUPPORTED_AGENTS,
  parseClaudeCodeTranscript,
} from './lib/o11y/index.js';
