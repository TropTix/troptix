-- Read-only login for AI agents and other tools that inspect prod data.
-- Decision + rationale: docs/adr/0037-agents-read-prod-through-select-only-credentials.md
--
-- The grants are what stop writes. default_transaction_read_only only catches
-- mistakes: any session can SET it off. Never grant this role membership in
-- postgres, service_role, authenticated or anon.
--
-- No password here. The role cannot log in until one is set by hand per
-- environment (docs/runbooks/agent-read-only-access.md).
--
-- bypassrls lets it read past RLS, which denies every role without a policy.
-- It changes which rows SELECT can see, never what the role may do.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'agent_reader') then
    create role agent_reader login noinherit bypassrls connection limit 5;
  end if;
end
$$;

alter role agent_reader set default_transaction_read_only = on;
alter role agent_reader set statement_timeout = '15s';
alter role agent_reader set idle_in_transaction_session_timeout = '60s';

grant usage on schema public to agent_reader;
grant select on all tables in schema public to agent_reader;

alter default privileges for role postgres in schema public
  grant select on tables to agent_reader;
