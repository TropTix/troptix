import { spawnSync } from 'node:child_process';
import { webEnv } from '../lib/env';

// Production build of apps/web under the same environment the suite serves
// it with. NEXT_PUBLIC_* values are baked in at build time, so build and
// start must agree — this script and playwright.config.ts share webEnv().
const result = spawnSync('pnpm', ['--filter', 'web', 'build'], {
  stdio: 'inherit',
  env: webEnv(),
});
process.exit(result.status ?? 1);
