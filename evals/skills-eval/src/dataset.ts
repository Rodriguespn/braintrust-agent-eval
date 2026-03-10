import type { ScenarioConfig } from './scorer.js'

export const scenarios: Record<string, ScenarioConfig> = {
  'new-edge-function': {
    prompt: [
      'Create a new Edge Function called `hello-world` that:',
      '',
      '- Accepts a POST request with a JSON body containing a `name` field',
      '- Returns a JSON response with a `message` field greeting the name',
      '- Handles errors gracefully (invalid JSON, missing fields)',
      '',
      'Then start the local Supabase project and serve the function to verify it works.',
    ].join('\n'),
    expected: {
      referenceFilesRead: [
        'references/edge-fun-quickstart.md',
        'references/edge-fun-project-structure.md',
        'references/edge-pat-error-handling.md',
        'references/edge-pat-cors.md',
      ],
      requiredToolCalls: [
        // Created the edge function file via CLI
        { tool: 'shell', commandPattern: 'npx supabase functions new' },
        // Started local Supabase
        { tool: 'shell', commandPattern: 'npx supabase start' },
        // Served the function
        { tool: 'shell', commandPattern: 'npx supabase functions serve' },
      ],
    },
    tags: ['devflow', 'edge-functions'],
    metadata: {
      category: ['edge-functions', 'development-flow'],
      description: "Test the agent's ability to create an Edge Function and serve it locally.",
    },
  },
  'blog-posts-rls-mcp': {
    prompt: [
      "I'm building a blog app. Users sign up with email/password and should only see their own posts.",
      '',
      'Create a `posts` table with:',
      '',
      '- title (text), content (text), published (boolean) columns',
      '- Enable Row Level Security',
      '- RLS policies so users can only CRUD their own posts',
      '- Appropriate indexes',
      '',
      'Then:',
      '',
      '1. Check for security and performance issues of the project',
      '2. Commit the schema to a migration file',
      '3. Generate the TypeScript types',
    ].join('\n'),
    expected: {
      referenceFilesRead: [
        'references/db-rls-mandatory.md',
        'references/db-rls-performance.md',
        'references/db-schema-auth-fk.md',
        'references/dev-getting-started.md',
        'references/dev-mcp-setup.md',
        'references/dev-mcp-tools.md',
        'references/dev-local-workflow.md',
        'references/sdk-ts-generation.md',
      ],
      requiredToolCalls: [
        // Iterated on schema via MCP execute_sql (not psql, not manual migration files)
        { tool: 'unknown', commandPattern: 'execute_sql' },
        // Checked security and performance advisors via MCP
        { tool: 'unknown', commandPattern: 'get_advisors' },
        // Migration file was created by db pull
        [
          { tool: 'file_write', pathPattern: 'migrations' },
          { tool: 'file_edit', pathPattern: 'migrations' },
        ],
        // Generated TypeScript types
        { tool: 'shell', commandPattern: 'npx supabase gen types' },
      ],
    },
    tags: ['database', 'rls', 'mcp'],
    metadata: {
      category: ['database', 'development-flow'],
      description:
        "Test the agent's ability to set up a posts table with RLS using the iterate-then-commit workflow: iterate on schema via MCP execute_sql, check advisors, then commit with db pull and generate types.",
    },
  },
  'team-rls-security-definer': {
    prompt: [
      "I'm building a project management app where users can belong to multiple organizations. Each organization has projects that all members can view and edit.",
      '',
      'Create a SQL migration with:',
      '',
      '1. An `organizations` table (name, slug)',
      '2. A `memberships` table linking users to organizations with a role column (owner, admin, member)',
      '3. A `projects` table (name, description, status) belonging to an organization',
      '',
      'Set up Row Level Security so:',
      '- Users can only see organizations they belong to',
      '- Users can only see and manage projects in their organizations',
      '- Only org owners can delete projects',
      '',
      'The migration should handle the case where a user is deleted from auth.',
      '',
      'Once the migration is ready, start the database and apply the migration to verify it works.',
    ].join('\n'),
    expected: {
      referenceFilesRead: [
        'references/db-rls-mandatory.md',
        'references/db-rls-policy-types.md',
        'references/db-rls-common-mistakes.md',
        'references/db-rls-performance.md',
        'references/db-security-functions.md',
        'references/db-schema-auth-fk.md',
        'references/db-migrations-idempotent.md',
      ],
      requiredToolCalls: [
        // Wrote the migration file
        [
          { tool: 'file_write', pathPattern: 'migrations' },
          { tool: 'file_edit', pathPattern: 'migrations' },
        ],
        // Started local Supabase
        { tool: 'shell', commandPattern: 'npx supabase start' },
        // Applied the migration
        [
          { tool: 'shell', commandPattern: 'npx supabase db push' },
          { tool: 'shell', commandPattern: 'npx supabase db reset' },
          { tool: 'shell', commandPattern: 'npx supabase migration up' },
        ],
      ],
    },
    tags: ['database', 'rls'],
    metadata: {
      category: ['database'],
      description: "Test the agent's ability to create a multi-tenant RLS migration using security_definer helper functions in a private schema.",
    },
  },
  'auth-rls-new-project': {
    prompt: [
      "I'm starting a new Supabase project. Initialize the project, start the local dev stack, and create a migration for a `tasks` table.",
      '',
      'The tasks table should have:',
      '- A title (text)',
      '- A status column (e.g., pending, in_progress, done)',
      '- Timestamps for created and updated',
      '- A reference to the authenticated user who owns the task',
      '',
      'Set up Row Level Security so users can only see and manage their own tasks.',
      'The migration should be safe to run multiple times. At the end, apply the migration to the development database to verify it works.',
    ].join('\n'),
    prestartSupabaseProject: false,
    expected: {
      referenceFilesRead: [
        'references/dev-getting-started.md',
        'references/db-rls-mandatory.md',
        'references/db-rls-policy-types.md',
        'references/db-rls-common-mistakes.md',
        'references/db-schema-auth-fk.md',
        'references/db-schema-timestamps.md',
        'references/db-migrations-idempotent.md',
      ],
      requiredToolCalls: [
        // Initialize the project
        { tool: 'shell', commandPattern: 'npx supabase init' },
        // Start the local stack
        { tool: 'shell', commandPattern: 'npx supabase start' },
        // Write the migration file
        [
          { tool: 'file_write', pathPattern: 'migrations' },
          { tool: 'file_edit', pathPattern: 'migrations' },
        ],
        // Apply the migration via MCP
        { tool: 'unknown', commandPattern: 'execute_sql' },
      ],
    },
    tags: ['database', 'rls', 'development-flow'],
    metadata: {
      category: ['database', 'development-flow'],
      description:
        "Test the agent's ability to initialize a Supabase project from scratch, start the local stack, and create a tasks table with RLS.",
    },
  },
  'extension-wrong-schema': {
    prompt: [
      "I'm building a semantic search feature. Create a migration that:",
      '1. Enables the pgvector extension',
      '2. Creates a `documents` table with an `embedding` column (1536 dimensions for OpenAI ada-002), a `content` text column, and a `user_id`',
      '3. Adds a vector similarity search index',
      '4. Users should only see their own documents',
      'Put the migration in `supabase/migrations/`.',
    ].join('\n'),
    expected: {
      referenceFilesRead: [
        'references/db-schema-extensions.md',
        'references/db-rls-mandatory.md',
        'references/db-migrations-idempotent.md',
        'references/db-schema-auth-fk.md',
        'references/db-rls-common-mistakes.md',
      ],
      requiredToolCalls: [
        // Write the migration file
        [
          { tool: 'file_write', pathPattern: 'migrations' },
          { tool: 'file_edit', pathPattern: 'migrations' },
        ],
        // Apply the migration via MCP
        { tool: 'unknown', commandPattern: 'execute_sql' },
      ],
    },
    tags: ['database', 'rls', 'extensions'],
    metadata: {
      category: ['database'],
      description:
        "Test the agent's ability to create a pgvector migration with the extension in the correct schema and HNSW index.",
    },
  },
  'rls-user-metadata-role-check': {
    prompt: [
      'Create a migration for a `documents` table. Each document has a `title` (text), `content` (text), and an owner.',
      'Regular users can only see their own documents. Admin users (identified by a role field in their JWT) should be able to see all documents.',
      'Put the migration in `supabase/migrations/`.',
    ].join('\n'),
    expected: {
      referenceFilesRead: [
        'references/db-rls-common-mistakes.md',
        'references/db-rls-policy-types.md',
        'references/db-rls-performance.md',
        'references/db-rls-mandatory.md',
        'references/db-schema-auth-fk.md',
      ],
      requiredToolCalls: [
        // Write the migration file
        [
          { tool: 'file_write', pathPattern: 'migrations' },
          { tool: 'file_edit', pathPattern: 'migrations' },
        ],
        // Apply the migration via MCP
        { tool: 'unknown', commandPattern: 'execute_sql' },
      ],
    },
    tags: ['database', 'rls', 'security'],
    metadata: {
      category: ['database', 'authentication'],
      description:
        "Test whether the agent uses app_metadata (server-only) instead of user_metadata (client-writable) for role-based RLS policies.",
    },
  },
  'cli-hallucinated-commands': {
    prompt: [
      "I'm onboarding a new developer to my Supabase project. Create a `CLI_REFERENCE.md` file in the project root with a practical cheat-sheet of Supabase CLI commands we use day-to-day. It should cover:",
      '',
      '1. Starting and stopping the local dev stack',
      '2. Managing database migrations (push, reset, diff)',
      '3. Working with the `process-order` Edge Function (local dev and deploy)',
      '4. How to view Edge Function logs (both local dev and production)',
      '5. How to run ad-hoc SQL queries against the database (local and remote)',
      '',
      'Include the actual commands with brief explanations.',
    ].join('\n'),
    expected: {
      referenceFilesRead: [
        'references/dev-getting-started.md',
        'references/edge-fun-quickstart.md',
      ],
      requiredToolCalls: [
        // Write the CLI reference file
        [
          { tool: 'file_write', pathPattern: 'CLI_REFERENCE' },
          { tool: 'file_write', pathPattern: 'cli_reference' },
          { tool: 'file_write', pathPattern: 'cli-reference' },
        ],
      ],
    },
    tags: ['development-flow', 'edge-functions', 'cli'],
    metadata: {
      category: ['development-flow', 'edge-functions'],
      description:
        "Test whether the agent hallucinates non-existent CLI commands like `supabase functions log` and `supabase db query`.",
    },
  },
  'collaborative-rooms-realtime': {
    prompt: [
      'Build a collaborative app where users can create rooms (shared spaces for group work), invite other users to join their rooms, and share content within them.',
      'Users should only see rooms they\'ve been invited to or created. Room owners can manage members, editors can create and modify content, and viewers can only read.',
      'All changes should appear in real-time.',
    ].join('\n'),
    expected: {
      referenceFilesRead: [
        'references/db-rls-mandatory.md',
        'references/db-rls-common-mistakes.md',
        'references/db-rls-performance.md',
        'references/db-security-functions.md',
        'references/db-schema-auth-fk.md',
        'references/db-schema-timestamps.md',
        'references/db-schema-realtime.md',
        'references/db-perf-indexes.md',
        'references/db-migrations-idempotent.md',
        'references/realtime-setup-auth.md',
        'references/realtime-broadcast-database.md',
        'references/realtime-setup-channels.md',
      ],
      requiredToolCalls: [
        // Write the migration file
        [
          { tool: 'file_write', pathPattern: 'migrations' },
          { tool: 'file_edit', pathPattern: 'migrations' },
        ],
        // Apply the migration via MCP
        { tool: 'unknown', commandPattern: 'execute_sql' },
      ],
    },
    tags: ['database', 'rls', 'realtime'],
    metadata: {
      category: ['database', 'realtime'],
      description:
        "Test the agent's ability to build a collaborative rooms app with role-based RLS, broadcast triggers, and realtime.messages policies.",
    },
  },
  'storage-rls-user-folders': {
    prompt: [
      'I need to set up file storage for my app. There are two use cases:',
      '',
      '1. **Avatars** -- Users upload a profile picture. Anyone can view avatars but only the owning user can upload or replace their own. Only allow image files (JPEG, PNG, WebP). Max 2MB.',
      '',
      '2. **Documents** -- Users upload private documents that only they can access. Max 50MB. No file type restriction.',
      '',
      'Create a SQL migration that:',
      '- Configures both storage buckets',
      '- Adds RLS policies on `storage.objects` so each user can only access their own folder (folder name = user ID)',
      '- Creates a `file_metadata` table to track uploaded files (file name, bucket, size, user reference) with appropriate security',
      '',
      'Users are authenticated via Supabase Auth.',
    ].join('\n'),
    expected: {
      referenceFilesRead: [
        'references/storage-access-control.md',
        'references/db-rls-mandatory.md',
        'references/db-rls-common-mistakes.md',
        'references/db-rls-performance.md',
        'references/db-schema-auth-fk.md',
        'references/db-schema-timestamps.md',
        'references/db-perf-indexes.md',
        'references/db-migrations-idempotent.md',
      ],
      requiredToolCalls: [
        // Write the migration file
        [
          { tool: 'file_write', pathPattern: 'migrations' },
          { tool: 'file_edit', pathPattern: 'migrations' },
        ],
        // Apply the migration via MCP
        { tool: 'unknown', commandPattern: 'execute_sql' },
      ],
    },
    tags: ['database', 'rls', 'storage'],
    metadata: {
      category: ['database', 'storage'],
      description:
        "Test the agent's ability to configure storage buckets with RLS policies, user-folder isolation, and file type restrictions.",
    },
  },
  'sdk-best-practices': {
    prompt: [
      'This project has a Supabase schema with `posts` and `comments` tables (see the existing migration).',
      'Create a Next.js API route handler at `app/api/posts/route.ts` that:',
      '',
      '1. Creates a Supabase server client correctly (using @supabase/ssr)',
      '2. Validates the authenticated user on the server side',
      '3. Has a GET handler that returns the user\'s posts with their comments in a single efficient query (no N+1)',
      '4. Has a POST handler that creates a new post for the authenticated user, returning the created post or null if not found',
      '5. Handles all errors properly (always check { data, error })',
      '',
      'Also: generate TypeScript types from the local database and use them, use type-safe helpers (Tables, TablesInsert) not verbose paths, use .maybeSingle() when 0 rows is a valid outcome.',
      'The code should follow Supabase SDK best practices.',
    ].join('\n'),
    expected: {
      referenceFilesRead: [
        'references/sdk-client-server.md',
        'references/sdk-error-handling.md',
        'references/sdk-query-crud.md',
        'references/sdk-query-filters.md',
        'references/sdk-query-joins.md',
        'references/sdk-perf-queries.md',
        'references/sdk-ts-generation.md',
        'references/sdk-ts-usage.md',
        'references/auth-core-sessions.md',
      ],
      requiredToolCalls: [
        // Write the route handler
        [
          { tool: 'file_write', pathPattern: '.ts' },
          { tool: 'file_edit', pathPattern: '.ts' },
        ],
        // Generate TypeScript types
        { tool: 'shell', commandPattern: 'npx supabase gen types' },
      ],
    },
    tags: ['sdk', 'typescript'],
    metadata: {
      category: ['sdk', 'development-flow'],
      description:
        "Test the agent's ability to create a type-safe Next.js API route using Supabase SDK best practices.",
    },
  }
}
