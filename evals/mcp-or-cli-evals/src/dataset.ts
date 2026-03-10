export type ScenarioConfig = {
  prompt: string
  prestartSupabaseProject?: boolean
  tags?: string[]
  metadata?: {
    category?: string[]
    description?: string
  }
}

export const scenarios: Record<string, ScenarioConfig> = {
  'cli-or-mcp-locally': {
    prompt: [
      'I have a local Supabase project already running. Please do the following:',
      '',
      '1. Get the project URL and publishable (anon) API key',
      '2. List the enabled Postgres extensions',
      '3. List the existing tables in the database',
      '4. Create a `products` table with columns: id (uuid, primary key, default gen_random_uuid()), name (text not null), price (numeric not null), description (text), created_at (timestamptz default now()).',
      '5. Insert 3 sample products and verify they were inserted by querying the table',
      '6. Check the security and performance advisors for any issues',
      '7. Fetch recent logs to check for any errors',
      '8. Search the Supabase documentation to understand best practices for RLS with the service role key',
      '9. Generate TypeScript types from the current database schema',
      '10. List all migrations to confirm the current state',
      '11. Commit the schema as a new migration file',
      'Use supabase skill.'
    ].join('\n'),
    prestartSupabaseProject: true,
    tags: ['database', 'mcp-vs-cli'],
    metadata: {
      category: ['database'],
      description:
        'Neutral prompt testing whether the agent prefers MCP tools or CLI commands when both are available.',
    },
  },
}
