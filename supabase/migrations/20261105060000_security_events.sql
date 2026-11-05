-- kaluwo security audit log
--
-- Records authentication and (later) moderation events together with the
-- request IP, the user agent and the account involved. This is operational
-- security data, not forum content:
--
--   * RLS is enabled with no policies, so anon/authenticated cannot read,
--     insert, update or delete anything. Only the service role can, which
--     means the table is reachable from server code and the dashboard only.
--   * IPs are personal data. Keep a short retention window (see the comment
--     at the bottom) and never copy them into the repository, fixtures or
--     client bundles.
--   * The app writes NULL when the platform does not expose a trustworthy
--     client address (for example `next dev`). It never invents one.

begin;

create table public.security_events (
  id bigint generated always as identity primary key,
  event text not null,
  user_id uuid references auth.users (id) on delete set null,
  ip inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint security_events_event_format
    check (event ~ '^[a-z0-9_.-]{1,64}$'),
  constraint security_events_user_agent_length
    check (user_agent is null or char_length(user_agent) <= 512),
  constraint security_events_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

-- Newest-first reads for the dashboard, per-member lookups for support, and
-- per-IP lookups when investigating abuse.
create index security_events_created_at_idx
  on public.security_events (created_at desc);
create index security_events_user_id_idx
  on public.security_events (user_id, created_at desc);
create index security_events_ip_idx
  on public.security_events (ip, created_at desc)
  where ip is not null;

alter table public.security_events enable row level security;

-- Supabase grants table access to anon/authenticated by default. Remove it
-- explicitly: with RLS on and no policies, nobody except the service role can
-- touch the table.
revoke all on table public.security_events from anon, authenticated;
revoke all on sequence public.security_events_id_seq from anon, authenticated;
grant all on table public.security_events to service_role;
grant usage, select on sequence public.security_events_id_seq to service_role;

comment on table public.security_events is
  'Service-role-only security audit trail. Contains personal data (IP addresses); apply a retention policy.';
comment on column public.security_events.ip is
  'Client address from Cloudflare/proxy headers, or NULL when no trustworthy value was available.';
comment on column public.security_events.metadata is
  'Small, non-secret context (username, reason). Never store passwords, tokens or CAPTCHA values.';

-- Retention: delete rows older than the window you commit to in the privacy
-- notice. Run daily, for example with pg_cron:
--
--   select cron.schedule(
--     'prune-security-events',
--     '0 3 * * *',
--     $$delete from public.security_events
--        where created_at < now() - interval '90 days'$$
--   );
--
-- 90 days is a starting point, not a requirement. Pick the shortest window
-- that still supports abuse investigation.

commit;
