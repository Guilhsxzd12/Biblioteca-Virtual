create table if not exists public.telegram_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  telegram_user_id bigint not null unique,
  chat_id bigint not null,
  username text,
  first_name text,
  linked_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists telegram_accounts_username_idx on public.telegram_accounts (lower(username));

create table if not exists public.telegram_link_codes (
  code uuid primary key,
  telegram_user_id bigint not null,
  chat_id bigint not null,
  username text,
  first_name text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists telegram_link_codes_expiry_idx on public.telegram_link_codes (expires_at);

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'inactive' check (status in ('inactive','active','canceled')),
  active_until timestamptz,
  activated_at timestamptz,
  activated_by uuid references auth.users(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.telegram_accounts enable row level security;
alter table public.telegram_link_codes enable row level security;
alter table public.subscriptions enable row level security;

revoke all on table public.telegram_accounts from anon, authenticated;
revoke all on table public.telegram_link_codes from anon, authenticated;
revoke all on table public.subscriptions from anon, authenticated;

grant all on table public.telegram_accounts to service_role;
grant all on table public.telegram_link_codes to service_role;
grant all on table public.subscriptions to service_role;
