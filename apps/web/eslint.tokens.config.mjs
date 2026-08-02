// Standalone config for `yarn lint:tokens` — runs ONLY the design-token
// guardrail, so CI can enforce it while the full lint still carries
// pre-existing react-hooks failures (see .github/workflows/ci.yml).
import { defineConfig } from 'eslint/config';

import designTokens from './eslint.design-tokens.mjs';

export default defineConfig([designTokens]);
