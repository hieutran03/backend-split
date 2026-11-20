import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Database separation guard (docs/integration.md). The backend connects to its OWN
 * database: no Record maps an Engine table and no SQL string touches one. Engine data
 * is reached through the Engine API (E10–E12) or integration events.
 *
 * A static scan of src/ (not an import of app.entities, which would load every Nest
 * module into Jest).
 */
const ENGINE_OWNED_TABLES = [
  'conversation_memory_summaries',
  'conversation_summary_jobs',
  'document_chunks',
  'document_images',
  'document_index_generations',
  'document_parse_artifacts',
  'model_usage_events',
  'model_usage_minute',
  'tool_execution_receipts',
  'tool_result_blobs',
  'user_memories',
  'checkpoints',
  'checkpoint_blobs',
  'checkpoint_writes',
  'checkpoint_migrations',
];

/** docs/reference/database-schema.md "Bảng BACKEND sở hữu" + tables the backend adds. */
const BACKEND_OWNED_TABLES = [
  'agent_model_configs',
  'chat_images',
  'client_devices',
  'conversation_custom_agents',
  'conversations',
  'custom_agents',
  'documents',
  'feedbacks',
  'generation_commands',
  'generations',
  'hitl_interrupts',
  'messages',
  'model_providers',
  'project_custom_agents',
  'projects',
  'server_secrets',
  'skill_settings',
  'task_plans',
  'tool_approval_settings',
  'tool_approvals',
  'users',
  'web_image_references',
  // added by the backend
  'refresh_tokens',
  'outbox_events',
  'inbox_events',
];

const SRC = join(__dirname);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
      ? [path]
      : [];
  });
}

const files = sourceFiles(SRC).map((path) => ({
  path: relative(SRC, path).replace(/\\/g, '/'),
  text: readFileSync(path, 'utf8'),
}));

function entityTables(): Array<{ path: string; table: string }> {
  return files.flatMap(({ path, text }) =>
    [...text.matchAll(/@Entity\(\s*'([a-z_]+)'/g)].map((m) => ({
      path,
      table: m[1] ?? '',
    })),
  );
}

describe('database separation guard', () => {
  it('finds the Records (sanity check of the scan)', () => {
    expect(entityTables().map((e) => e.table)).toEqual(
      expect.arrayContaining(['users', 'conversations', 'outbox_events']),
    );
  });

  it('maps no table owned by the AI Engine', () => {
    const leaked = entityTables().filter((e) =>
      ENGINE_OWNED_TABLES.includes(e.table),
    );
    expect(leaked).toEqual([]);
  });

  it('maps only tables listed as backend-owned', () => {
    const unknown = entityTables().filter(
      (e) => !BACKEND_OWNED_TABLES.includes(e.table),
    );
    expect(unknown).toEqual([]);
  });

  it('has no SQL that reads or writes an Engine table', () => {
    const tables = ENGINE_OWNED_TABLES.join('|');
    const sql = new RegExp(
      `\\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\\s+"?(?:${tables})\\b`,
      'i',
    );
    const offenders = files
      .filter(
        ({ path, text }) => !path.startsWith('contracts/') && sql.test(text),
      )
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });
});
