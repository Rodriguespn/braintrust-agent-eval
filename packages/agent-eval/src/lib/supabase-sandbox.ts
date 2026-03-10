/**
 * Supabase-specific sandbox setup.
 * Installs the Supabase CLI and Docker tooling needed to run `supabase start`
 * inside a Docker sandbox container that has /var/run/docker.sock mounted.
 *
 * IMPORTANT: The sandbox container MUST be created with `capAdd: ['NET_ADMIN']`
 * so that iptables DNAT rules can redirect traffic from 127.0.0.1 to the
 * Docker bridge gateway where sibling containers' published ports live.
 */

import type { DockerSandboxManager } from './docker-sandbox.js';

const SUPABASE_CLI_VERSION = '2.67.1';

/**
 * All ports that `supabase start` publishes and health-checks.
 * The CLI connects to 127.0.0.1:<port> to verify each service.
 */
const SUPABASE_PORTS = [54321, 54322, 54323, 54324, 54327, 54329];

export interface PrestartSupabaseProjectOptions {
  stopAll?: boolean;
}

/**
 * Run a diagnostic command inside the sandbox, swallowing errors so one
 * failing diagnostic never aborts the rest.
 */
async function runDiagnostic(
  sandbox: DockerSandboxManager,
  command: string,
): Promise<string> {
  try {
    const result = await sandbox.runShellAsRoot(command);
    return result.stdout.trim();
  } catch (err) {
    return `[error] ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * Aggressively clean up all Supabase containers and networks by Docker
 * name/label patterns. This is more reliable than `supabase stop` which
 * requires a project config.toml to know what to stop.
 */
async function aggressiveSupabaseCleanup(sandbox: DockerSandboxManager): Promise<void> {
  // Kill containers by name pattern
  await runDiagnostic(
    sandbox,
    'docker rm -f $(docker ps -aq --filter name=supabase) 2>/dev/null || true',
  );

  // Kill containers by Supabase CLI label
  await runDiagnostic(
    sandbox,
    'docker rm -f $(docker ps -aq --filter label=com.supabase.cli.project) 2>/dev/null || true',
  );

  // Remove stale Supabase networks
  await runDiagnostic(
    sandbox,
    'docker network rm $(docker network ls --filter name=supabase -q) 2>/dev/null || true',
  );
}

/**
 * Set up iptables DNAT rules to redirect traffic from 127.0.0.1:<port> to
 * <gateway>:<port>. This is kernel-level port forwarding that preserves
 * correct TCP behavior (connection refused when backend is down, immediate
 * connection when backend is up).
 *
 * This replaces the previous socat-based approach which had two problems:
 * 1. socat processes could die between setup and `supabase start` execution
 * 2. socat accepted TCP connections immediately (hiding backend unavailability),
 *    causing the Supabase CLI's health-check to hang instead of retrying
 */
async function setupIptablesDnat(sandbox: DockerSandboxManager, gateway: string): Promise<void> {
  // Flush any existing DNAT/MASQUERADE rules we may have added
  await runDiagnostic(sandbox, 'iptables -t nat -F OUTPUT 2>/dev/null || true');
  await runDiagnostic(sandbox, 'iptables -t nat -F POSTROUTING 2>/dev/null || true');

  // Add DNAT rules for each port: 127.0.0.1:<port> → <gateway>:<port>
  // These are OUTPUT chain rules (for locally-generated traffic) that redirect
  // connections made to loopback ports to the Docker bridge gateway.
  for (const port of SUPABASE_PORTS) {
    await sandbox.runShellAsRoot(
      `iptables -t nat -A OUTPUT -p tcp -d 127.0.0.1 --dport ${port} -j DNAT --to-destination ${gateway}:${port}`
    );
  }

  // Add MASQUERADE rule so DNAT'd packets have the container's real IP as source.
  // Without this, packets arrive at the gateway with source 127.0.0.1, and the
  // reply goes to the gateway's own loopback instead of back to us.
  await sandbox.runShellAsRoot(
    `iptables -t nat -A POSTROUTING -p tcp -d ${gateway} -j MASQUERADE`
  );

  // Verify rules were applied
  const rules = await runDiagnostic(sandbox, 'iptables -t nat -L OUTPUT -n 2>/dev/null');
  const missingPorts = SUPABASE_PORTS.filter(port => !rules.includes(`:${port}`));
  if (missingPorts.length > 0) {
    console.warn(`[supabase-sandbox] iptables DNAT rules missing for ports: ${missingPorts.join(', ')}`);
  }
}

/**
 * Set up a Docker sandbox for Supabase development.
 *
 * Installs docker CLI, Supabase CLI, and sets up iptables DNAT rules so that
 * `supabase start`'s health checks work in Docker-out-of-Docker mode.
 *
 * Problem: the sandbox runs inside a Docker container with bridge networking.
 * `supabase start` spawns sibling containers (via the mounted Docker socket) and
 * then health-checks them by connecting to 127.0.0.1:<port>. But 127.0.0.1 inside
 * a bridge-networked container is the container's own loopback — not the Docker
 * host's — so the health checks fail even though the containers are running fine.
 *
 * Fix: use iptables DNAT to redirect traffic from 127.0.0.1:<port> to the bridge
 * gateway IP where sibling containers' published ports are reachable. This is
 * kernel-level forwarding that preserves correct TCP behavior — unlike socat,
 * which accepts connections immediately and hides backend unavailability.
 */
export async function setupSupabaseSandbox(sandbox: DockerSandboxManager): Promise<void> {
  // Install Docker CLI, curl, postgresql-client, iptables, and iproute2 (for `ip route`)
  await sandbox.runShellAsRoot(
    'apt-get update -qq && apt-get install -y -qq --no-install-recommends ' +
    'curl docker.io postgresql-client iptables iproute2 > /dev/null 2>&1'
  );

  // Install Supabase CLI (architecture-aware, pinned version)
  await sandbox.runShellAsRoot(
    `ARCH=$(dpkg --print-architecture) && ` +
    `case "$ARCH" in amd64) SUPABASE_ARCH="linux_amd64" ;; arm64) SUPABASE_ARCH="linux_arm64" ;; *) echo "Unsupported arch: $ARCH" && exit 1 ;; esac && ` +
    `curl -fsSL "https://github.com/supabase/cli/releases/download/v${SUPABASE_CLI_VERSION}/supabase_\${SUPABASE_ARCH}.tar.gz" | tar xz -C /usr/local/bin supabase && ` +
    `chmod +x /usr/local/bin/supabase`
  );

  // Grant sandbox user access to the Docker socket.
  await sandbox.runShellAsRoot('chmod 666 /var/run/docker.sock');

  // Aggressively clean up stale Supabase containers from previous runs.
  await aggressiveSupabaseCleanup(sandbox);

  // Determine the Docker bridge gateway — the IP where sibling containers'
  // published ports are reachable from inside this container.
  const gwResult = await sandbox.runShellAsRoot(
    "ip route show default | awk '{print $3}' | head -1"
  );
  const gateway = gwResult.stdout.trim();

  if (!gateway) {
    console.warn('[supabase-sandbox] Could not determine bridge gateway IP; supabase start health checks may fail');
    return;
  }

  // Set up iptables DNAT rules to redirect loopback ports to the gateway
  await setupIptablesDnat(sandbox, gateway);
}

async function runSupabaseCommand(
  sandbox: DockerSandboxManager,
  command: string,
  label: string,
): Promise<void> {
  const result = await sandbox.runShell(command);
  if (result.exitCode !== 0) {
    throw new Error(`[${label}] failed: ${result.stderr || result.stdout}`);
  }
}

/**
 * Prepare a local Supabase project before agent execution.
 * Defaults to clean + start + reset to ensure MCP availability and deterministic state.
 */
export async function prestartSupabaseProject(
  sandbox: DockerSandboxManager,
  options: PrestartSupabaseProjectOptions = {},
): Promise<void> {
  const {
    stopAll = true,
  } = options;

  if (stopAll) {
    await sandbox.runShell('npx supabase stop --all --no-backup');
  }

  await runSupabaseCommand(sandbox, 'npx supabase start', 'supabase start');
}

/**
 * Tear down Supabase sibling containers spawned via the mounted Docker socket.
 * Best-effort: all errors are swallowed so teardown never prevents sandbox cleanup.
 */
export async function teardownSupabaseSandbox(sandbox: DockerSandboxManager): Promise<void> {
  try {
    await sandbox.runShell('npx supabase stop --all --no-backup');

    // Aggressively remove all Supabase containers and networks
    await aggressiveSupabaseCleanup(sandbox);
  } catch (err) {
    console.warn('[supabase-sandbox] teardown error (best-effort):', err instanceof Error ? err.message : err);
  }
}
