import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma 7 moved schema location + the migrations datasource out of the
 * `datasource` block and into this file. We only use the Prisma CLI as a SQL
 * *generator* (`prisma migrate diff` in scripts/new-migration.ts) — plain SQL
 * under supabase/migrations is the source of truth (ADR 0004). The runtime
 * client connects via the pg driver adapter in src/server/prisma.ts, not this.
 *
 * `url` here is the DIRECT (5432, non-pooling) connection the CLI uses for
 * migrate diff against the branch you're working on.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('POSTGRES_URL_NON_POOLING'),
  },
});
