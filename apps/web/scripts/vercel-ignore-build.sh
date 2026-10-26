#!/usr/bin/env bash
# Vercel's Ignored Build Step. Exit 0 skips the deploy, exit 1 builds it.
# Vercel runs it from apps/web on a shallow (depth 10) clone.
set -u

build() { echo "build: $1"; exit 1; }
skip() { echo "skip: $1"; exit 0; }

[ -n "${VERCEL:-}" ] || build "system environment variables are not exposed"
[ "${VERCEL_ENV:-}" != "production" ] || build "production"

case "${VERCEL_GIT_COMMIT_MESSAGE:-}" in
  *"[skip preview]"*) skip "commit message says [skip preview]" ;;
esac

base="${VERCEL_GIT_PREVIOUS_SHA:-}"
[ -n "$base" ] || build "first deploy of ${VERCEL_GIT_COMMIT_REF:-this branch}"
git cat-file -e "$base^{commit}" 2>/dev/null || build "last deploy $base is outside the clone"

cd "$(git rev-parse --show-toplevel)"

if git diff --quiet "$base" HEAD -- \
  apps/web packages \
  package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json .nvmrc \
  ':(exclude)*.md' \
  ':(exclude)*.test.ts' ':(exclude)*.test.tsx' \
  ':(exclude)apps/web/jest.config.ts' ':(exclude)packages/api/vitest.config.ts' \
  ':(exclude)apps/web/knip.json' \
  ':(exclude)apps/web/eslint.config.mjs' ':(exclude)apps/web/.eslintrc.json'; then
  skip "nothing the web build reads changed since $base"
fi
build "web sources changed since $base"
