/**
 * Agent registry with built-in agents.
 */

import { registerAgent, getAgent, listAgents, hasAgent } from './registry.js';
import { createClaudeCodeAgent } from './claude-code.js';

// Register Claude Code agent (direct Anthropic API)
registerAgent(createClaudeCodeAgent());

// Re-export registry functions
export { registerAgent, getAgent, listAgents, hasAgent };

// Re-export agent types
export type { Agent, AgentRunOptions, AgentRunResult } from './types.js';
