# MCP vs CLI — early eval results

Hey team, sharing some early results from an eval I've been running with **claude-sonnet-4-6**. Attaching the heatmap and grouped chart.

---

## Background

We're still figuring out what the right dev flow is for agents working on a **local Supabase project** (bash + Supabase CLI available). Our current recommended mix is:

- **MCP** for things with no CLI equivalent: `get_advisors`, `get_logs`
- **MCP** for writing migrations and arbitrary SQL locally using `execute_sql`
- **CLI** for most everything else

This assumes the MCP server is already configured and running at `localhost:54321/mcp`. That last part matters — agents **can't use an MCP server they just set up themselves**. They write the `.mcp.json` but need a human to reload the session before the tools become available. Without that, they could curl the MCP endpoint directly, but in practice they just fall back to CLI.

That raised a question: **if the MCP server needs to be pre-configured anyway, should we lean into the CLI instead of a MCP+CLI hybrid?** This eval explores that.

---

## Eval setup

The agent gets a neutral prompt covering all the operations we care about:

```bash
I have a local Supabase project already running. Please do the following:
1. Get the project URL and publishable (anon) API key
2. List the enabled Postgres extensions
3. List the existing tables in the database
4. Create a `products` table with columns: id (uuid, primary key, default gen_random_uuid()), name (text not null), price (numeric not null), description (text), created_at (timestamptz default now()).
5. Insert 3 sample products and verify they were inserted by querying the table
6. Check the security and performance advisors for any issues
7. Fetch recent logs to check for any errors
8. Search the Supabase documentation to understand best practices for RLS with the service role key
9. Generate TypeScript types from the current database schema
10. List all migrations to confirm the current state
11. Commit the schema as a new migration file
Use Supabase skill.
```

The scorer tracks each operation and records MCP vs CLI. **Score = MCP calls / total tracked calls.**

Four conditions, all with the MCP server pre-configured:

| # | Condition | Skills | MCP tools exposed |
|---|---|---|---|
| 1 | **Baseline** | No | All |
| 2 | **Skills + 20 tools** | Yes (not read) | All 20 |
| 3 | **Skills + 8 tools** | Yes (read) | Docs, database, debugging groups |
| 4 | **Skills + 7 tools** | Yes (read) | Database + debugging (no docs tools) |

---

## Findings

### 1 — Agents prefer MCP over CLI by default

Even with no skills and no guidance, the agent reaches for MCP tools over CLI equivalents. The baseline scores 0.82 MCP — not because of any instruction, just because the tools are there and well-named. So the "should we just use CLI?" question has a pretty clear answer: the agent won't, even if that's what we want.

### 2 — With 20 tools, the skill is never read

Confirmed by transcript. The agent loads tools via ToolSearch and starts working — skill files are present in the sandbox but never opened. Our hypothesis: 20 tools already consume enough context that the agent skips the skill file to preserve space.

### 3 — Fewer tools → skill gets loaded

At 8 tools (docs + database + debugging groups), the skill is read before the agent acts. This is the behaviour we want. The heatmap shows a cleaner, more deliberate pattern compared to the noisier baseline.

### 4 — Task completion drops with 20 tools, recovers without docs tools

This is visible in the **heatmap** — the baseline completes all tasks. The 20-tool condition is where the most operations are missed. Interestingly, removing the docs tools (7-tool condition) has the agent completing more tasks than the 8-tool condition, though still not guaranteed to finish all of them. My speculation is that the agent is running out of context and just exits — the docs tools add more tokens per tool call, which accelerates context exhaustion.

### 5 — The skills condition uses the most CLI commands

Visible in the **bar chart**. When the skill is actually read (8 and 7 tool conditions), the agent uses more CLI — which is expected, since our skill files explicitly recommend CLI over the local MCP for most local operations. This is the intended behaviour. The baseline uses MCP almost exclusively because there's nothing telling it otherwise.

---

## TL;DR

The agent defaults to MCP when left to its own devices, which isn't what we recommend for local projects. The skill corrects this — but only when it gets read. With 20 tools in context it doesn't get read. Reducing the toolset fixes that, though there's a tradeoff: too few tools and the agent runs out of context before finishing. The sweet spot seems to be a focused subset that includes the tools we actually want to promote.

---

## Golden path options

From these findings, two directions are worth evaluating.

### Option A — Slim local MCP (hybrid)

`supabase start` writes a `.mcp.json` and starts a local MCP server at `localhost:54321/mcp`, but only exposes a focused subset of tools: database group + debugging group, optionally docs if we want to push documentation search without requiring auth.

**Why this works:** Agents reach for MCP tools when they're available and well-named (baseline scored 0.82 MCP with no guidance at all). A small, curated local MCP set gives agents the AI-friendly interface for the operations where it genuinely adds value, while a skill file steers them toward CLI for everything else. The reduced tool count ensures the skill gets loaded.

**Tradeoff — remote/local overlap:** If the user also has the Supabase remote MCP server configured, tool names will collide. Mitigation: namespace the local MCP server's tool names and descriptions so they're clearly scoped to the local project (e.g. `local_execute_sql`, `local_get_logs`). This keeps remote and local tools distinct in the agent's decision tree.

### Option B — CLI only for local

No local MCP server. All local operations go through the Supabase CLI. The remote MCP server can still be used for cloud projects without any overlap.

**Why this works:** One tool for all local tasks means a smaller, cleaner decision tree. No naming collisions with the remote MCP server. The skill file can be more prescriptive because there's no ambiguity about which tool to reach for.

**Gap:** Several operations used in the eval have no CLI equivalent today. These would need to be added before Option B is viable:

| Operation | Current state |
|---|---|
| Arbitrary SQL query | No `supabase db query` command |
| Security/performance advisors | MCP-only (`get_advisors`) |
| Structured log fetch | MCP-only (`get_logs`); CLI has `supabase db logs` but limited |
| Docs search | MCP-only (`search_docs`) |
