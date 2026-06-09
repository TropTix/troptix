import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 moved schema location + the migrations datasource out of the
 * `datasource` block and into this file. We only use the Prisma CLI as a SQL
 * *generator* (`prisma migrate diff` in scripts/new-migration.ts) — plain SQL
 * under supabase/migrations is the source of truth (ADR 0004). The runtime
 * client connects via the pg driver adapter in src/index.ts, not this.
 *
 * `url` is the DIRECT (5432, non-pooling) connection the CLI uses for migrate
 * diff. We read it via `process.env` rather than prisma's `env()` helper on
 * purpose: `env()` resolves eagerly and THROWS when the var is absent, which
 * breaks `prisma generate` during CI install (no .env there) even though
 * generate never touches the datasource. The var is only needed by migrate
 * diff, and new-migration.ts already guards its presence before invoking it.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.POSTGRES_URL_NON_POOLING ?? '',
  },
});
