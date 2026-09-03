alter table public.telegram_accounts
  add column if not exists bot_context jsonb not null default '{}'::jsonb;

alter table public.telegram_accounts
  drop constraint if exists telegram_accounts_bot_mode_check;

alter table public.telegram_accounts
  add constraint telegram_accounts_bot_mode_check
  check (bot_mode in (
    'idle',
    'download',
    'upload_file',
    'upload_cover',
    'edit_title',
    'edit_author',
    'edit_year',
    'edit_description',
    'edit_cover'
  ));

update public.telegram_accounts
set bot_mode = case when bot_mode = 'upload' then 'upload_file' else bot_mode end,
    bot_context = coalesce(bot_context, '{}'::jsonb);

create table if not exists public.telegram_download_history (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('user','catalog')),
  book_id uuid not null,
  title_snapshot text not null,
  format text not null check (format in ('pdf','epub')),
  requested_at timestamptz not null default now()
);

create index if not exists telegram_download_history_user_requested_idx
  on public.telegram_download_history (user_id, requested_at desc);

alter table public.telegram_download_history enable row level security;
revoke all on table public.telegram_download_history from anon, authenticated;
grant all on table public.telegram_download_history to service_role;
