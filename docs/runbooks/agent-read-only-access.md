# Agent read-only access to prod

How to give an agent read access to prod Supabase and Stripe. The decision
and its reasons live in
[ADR 0037](../adr/0037-agents-read-prod-through-select-only-credentials.md).

## 1. Supabase

The migration `20261103150915_agent_reader_role.sql` creates `agent_reader`
with no password. After it reaches prod, set one from a trusted shell with
the admin connection string. Use `\password` so the password stays out of
query logs:

```bash
psql "$PROD_ADMIN_DATABASE_URL" -c '\password agent_reader'
```

Agents connect through the pooler. The user name carries the project ref:

```
postgresql://agent_reader.<project-ref>:<password>@<pooler-host>:5432/postgres
```

Store this as `AGENT_RO_DATABASE_URL` in the agent's environment. Agents query
it with `psql "$AGENT_RO_DATABASE_URL"`. Do not connect the Supabase MCP to
prod.

Check that writes fail before handing it over:

```bash
psql "$AGENT_RO_DATABASE_URL" -c "set default_transaction_read_only = off; begin read write; update public.\"Events\" set \"name\" = \"name\"; rollback;"
```

Expect `permission denied for table Events`.

To rotate, run `\password agent_reader` again. To cut off all access:

```sql
alter role agent_reader nologin;
```

## 2. Stripe

In the live Dashboard, under Developers → API keys, create a restricted key
named `agent-read-only`. Set every resource to **Read**, Connect resources
included. Add IP limits if the agent runs from a fixed address.

Store it as `STRIPE_RO_KEY`. Pass it to the Stripe CLI with
`--api-key "$STRIPE_RO_KEY"`, or to the local Stripe MCP with
`npx @stripe/mcp --api-key="$STRIPE_RO_KEY"`. Do not use `stripe login` or an
OAuth connection for prod.

## 3. Keep stronger keys away

The two credentials above stop writes only if the agent cannot find a
stronger one. On any machine or user account where an agent runs, check that
none of these exist:

- `sk_live_` keys or prod `SUPABASE_SECRET_KEY` / `service_role` values in any
  `.env` file. That includes commented-out lines.
- A prod admin connection string (`POSTGRES_URL_NON_POOLING`) in any file or
  shell profile.
- A Supabase CLI login (`supabase logout` removes it).
- A Vercel CLI login with access to production env vars
  (`vercel env pull --environment=production` would expose every secret).

Keep those in a password manager, or in a user account the agent cannot read.
Claude Code `deny` rules for `.env*` files help as an extra layer but do not
replace this step.
