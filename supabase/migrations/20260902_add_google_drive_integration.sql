create table if not exists public.app_integrations (
  provider text primary key,
  refresh_token text,
  account_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_integrations enable row level security;
grant select, insert, update, delete on table public.app_integrations to authenticated;

create policy "app_integrations_admin_select" on public.app_integrations for select to authenticated using (private.is_admin());
create policy "app_integrations_admin_insert" on public.app_integrations for insert to authenticated with check (private.is_admin());
create policy "app_integrations_admin_update" on public.app_integrations for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy "app_integrations_admin_delete" on public.app_integrations for delete to authenticated using (private.is_admin());
