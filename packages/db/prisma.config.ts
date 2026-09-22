import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// The DIRECT (5432) URL, for migrate diff only. `process.env`, not prisma's
// `env()`: env() throws when the var is absent, breaking `prisma generate` in
// CI (no .env there); new-migration.ts guards presence before migrate diff.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.POSTGRES_URL_NON_POOLING ?? '',
  },
});
