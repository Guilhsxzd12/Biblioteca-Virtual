alter table public.telegram_accounts
  add column if not exists bot_mode text not null default 'idle';

alter table public.telegram_accounts
  drop constraint if exists telegram_accounts_bot_mode_check;

alter table public.telegram_accounts
  add constraint telegram_accounts_bot_mode_check
  check (bot_mode in ('idle','download','upload'));
