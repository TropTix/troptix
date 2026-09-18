/**
 * Point POSTGRES_URL_NON_POOLING at your PR's preview branch — never the shared
 * dev branch or prod: an unmerged migration applied there collides when the PR
 * merges and Supabase Branching re-applies it.
 */
import { execFileSync } from 'node:child_process';

const url = process.env.POSTGRES_URL_NON_POOLING;
if (!url) {
  console.error(
    "POSTGRES_URL_NON_POOLING is required (direct 5432 connection to the branch you're working on)."
  );
  process.exit(1);
}

execFileSync('supabase', ['db', 'push', '--db-url', url], { stdio: 'inherit' });
