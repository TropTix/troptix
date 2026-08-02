// Design-system guardrail: UI colors come from semantic tokens, never raw
// Tailwind palette classes or arbitrary hex classes. See
// docs/audits/2026-08-01-shadcn-design-system-review.md (#277).
//
// The homepage art (hero.tsx / flyers.tsx) keeps its bespoke palette by owner
// decision (2026-08-02) and is the only exemption.

const PALETTE =
  '(gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)';
const PREFIX =
  '(bg|text|border|ring|outline|placeholder|divide|from|to|via|fill|stroke|decoration|accent|caret|shadow)';

const RAW_PALETTE = `${PREFIX}-${PALETTE}-[0-9]{2,3}`;
const ARBITRARY_HEX = `${PREFIX}-\\[#[0-9a-fA-F]{3,8}\\]`;

const MESSAGE =
  'Use semantic tokens (bg-background, text-muted-foreground, text-success, …) instead of raw palette or hex classes. Exemptions live in eslint.design-tokens.mjs.';

import tsParser from '@typescript-eslint/parser';

export default {
  files: ['src/**/*.ts', 'src/**/*.tsx'],
  ignores: ['src/app/_components/hero.tsx', 'src/app/_components/flyers.tsx'],
  languageOptions: {
    parser: tsParser,
    ecmaVersion: 'latest',
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: `Literal[value=/(^|[\\s'"\`])${RAW_PALETTE}([\\s/'"\`]|$)/]`,
        message: MESSAGE,
      },
      {
        selector: `TemplateElement[value.raw=/(^|[\\s'"])${RAW_PALETTE}([\\s/'"]|$)/]`,
        message: MESSAGE,
      },
      {
        selector: `Literal[value=/${ARBITRARY_HEX}/]`,
        message: MESSAGE,
      },
      {
        selector: `TemplateElement[value.raw=/${ARBITRARY_HEX}/]`,
        message: MESSAGE,
      },
    ],
  },
};
