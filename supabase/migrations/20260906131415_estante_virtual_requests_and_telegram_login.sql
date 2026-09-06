-- The catalogue is private: the application requires an authenticated,
-- approved subscriber before it renders or streams a book.
drop policy if exists books_public_read on public.books;
drop policy if exists categories_public_read on public.categories;
revoke all on table public.books from anon;
revoke all on table public.categories from anon;
grant select on table public.books to authenticated;
grant select on table public.categories to authenticated;

-- Reader uploads are retired. Existing rows are preserved for historical
-- purposes, but only the server-side service role can access them.
drop policy if exists user_books_owner_select on public.user_books;
drop policy if exists user_books_owner_insert on public.user_books;
drop policy if exists user_books_owner_delete on public.user_books;
revoke all on table public.user_books from anon, authenticated;
grant all on table public.user_books to service_role;

create table if not exists public.book_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 220),
  author text not null check (char_length(author) between 2 and 220),
  language text not null check (char_length(language) between 2 and 80),
  status text not null default 'pending'
    check (status in ('pending', 'published', 'archived')),
  matched_book_id uuid references public.books(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  notified_at timestamptz
);

create index if not exists book_requests_status_created_idx
  on public.book_requests (status, created_at desc);
create index if not exists book_requests_user_created_idx
  on public.book_requests (user_id, created_at desc);
create index if not exists book_requests_matched_book_idx
  on public.book_requests (matched_book_id);

alter table public.book_requests enable row level security;
revoke all on table public.book_requests from anon, authenticated;
grant all on table public.book_requests to service_role;

create table if not exists public.telegram_login_sessions (
  telegram_user_id bigint primary key,
  chat_id bigint not null,
  username text,
  first_name text,
  stage text not null default 'email' check (stage in ('email', 'password')),
  email text,
  attempts integer not null default 0 check (attempts between 0 and 20),
  expires_at timestamptz not null,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.telegram_login_sessions enable row level security;
revoke all on table public.telegram_login_sessions from anon, authenticated;
grant all on table public.telegram_login_sessions to service_role;

alter table public.telegram_accounts
  drop constraint if exists telegram_accounts_bot_mode_check;

update public.telegram_accounts
set bot_mode = 'idle',
    bot_context = '{}'::jsonb,
    updated_at = now()
where bot_mode not in ('idle', 'download', 'request_title', 'request_author', 'request_language');

alter table public.telegram_accounts
  add constraint telegram_accounts_bot_mode_check
  check (bot_mode in (
    'idle',
    'download',
    'request_title',
    'request_author',
    'request_language'
  ));
