# 37. Agents read prod through credentials that cannot write

- **Status:** Accepted
- **Date:** 2026-11-03

## Context

We want Claude and other agents to read prod data in Supabase and Stripe, to
answer customer questions and look into bugs. They must not be able to change
it, even by mistake.

Most read-only modes live in the client. The Supabase MCP's `--read-only` flag
sits on top of a personal access token that can do anything to the account,
including running SQL as `postgres` through the Management API. Claude Code
deny rules block named commands, but an agent with a shell can reach the same
data another way. If a stronger credential is anywhere the agent can read, a
client-side switch does not hold.

## Decision

The server enforces read-only. An agent gets only these two credentials:

- **Supabase:** a Postgres login, `agent_reader`, created by migration. It has
  `USAGE` on `public` and `SELECT` on every table there, current and future.
  It has no other grants, belongs to no other role, and has `bypassrls` so RLS
  does not hide rows from it. The migration sets no password. We set one by
  hand in each environment that needs it.
- **Stripe:** a restricted live key (`rk_live_…`) with every resource set to
  Read, Connect resources included.

The role also defaults to read-only transactions and short statement and idle
timeouts. Those settings guard against mistakes and protect prod load. The
grants stop the writes.

No `service_role` key, `sk_live_` key, Supabase access token or Vercel token
may sit where an agent runs. The runbook
([agent-read-only-access.md](../runbooks/agent-read-only-access.md)) lists the
places to check.

## Consequences

- We tested the role on the Supabase Postgres 17 image with every migration
  and the seed applied. With read-only transactions turned off, it still could
  not insert, update, delete, truncate, create tables, switch to another role,
  disable RLS or read `auth`. It could read new tables without a new grant.
- `auth`, `storage` and `vault` stay closed. Agents see `public."Users"` but
  not password hashes, sessions or secrets.
- Agents can read buyer names and emails, and those land in their transcripts.
  If that becomes a problem, grant SELECT on views without those columns and
  revoke it on the raw tables.
- Every role, `agent_reader` included, can execute functions by default. A new
  `SECURITY DEFINER` function in `public` that is not a trigger function gives
  this role a way to write. Revoke `EXECUTE` from `PUBLIC` on any such function.
- The role exists on every preview branch and on the dev branch, but no one can
  log in as it until someone sets a password there.
- This guarantee covers only these two credentials. A stronger key left in an
  agent's reach undoes it, so secret hygiene on agent hosts is part of the
  decision, not an extra.
