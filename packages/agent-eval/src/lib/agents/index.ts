/**
 * Agent registry with built-in agents.
 */

import { registerAgent, getAgent, listAgents, hasAgent } from './registry.js';
import { createClaudeCodeAgent, claudeCodeAdapter } from './claude-code.js';
import type { AgentAdapter } from './types.js';

// Register Claude Code agent (direct Anthropic API)
registerAgent(createClaudeCodeAgent());

const AGENT_ADAPTERS: Record<string, AgentAdapter> = {
  'claude-code': claudeCodeAdapter,
};

export function getAgentAdapter(name: string): AgentAdapter {
  const adapter = AGENT_ADAPTERS[name];
  if (!adapter) {
    throw new Error(
      `Unknown agent: "${name}". Supported agents: ${Object.keys(AGENT_ADAPTERS).join(', ')}`
    );
  }
  return adapter;
}

// Re-export registry functions
export { registerAgent, getAgent, listAgents, hasAgent };

// Re-export agent types
export type { Agent, AgentRunOptions, AgentRunResult, AgentAdapter } from './types.js';
