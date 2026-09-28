-- Owner and Scanner join the Membership roles (ADR 0035). A new enum value
-- cannot be used in the transaction that adds it, so the backfill that writes
-- 'OWNER' rows is the next migration.
alter type "MembershipRole" add value if not exists 'OWNER' before 'ADMIN';
alter type "MembershipRole" add value if not exists 'SCANNER';
