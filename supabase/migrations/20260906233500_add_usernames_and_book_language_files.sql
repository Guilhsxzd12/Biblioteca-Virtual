alter table public.profiles add column if not exists username text;

with base as (
  select id,
         lower(regexp_replace(coalesce(split_part(email,'@',1),'leitor'), '[^a-z0-9._-]+', '', 'g')) as candidate,
         row_number() over (partition by lower(regexp_replace(coalesce(split_part(email,'@',1),'leitor'), '[^a-z0-9._-]+', '', 'g')) order by created_at, id) as rn
  from public.profiles
  where username is null
)
update public.profiles p
set username = case
  when length(b.candidate) >= 3 and b.rn = 1 then left(b.candidate,32)
  when length(b.candidate) >= 1 then left(b.candidate,26) || '-' || substr(p.id::text,1,5)
  else 'leitor-' || substr(p.id::text,1,8)
end
from base b
where p.id=b.id and p.username is null;

update public.profiles
set username = 'leitor-' || substr(id::text,1,8)
where username is null;

update public.profiles set username=lower(username) where username is not null;
create unique index if not exists profiles_username_lower_uidx on public.profiles (lower(username)) where username is not null;

create table if not exists public.book_language_files (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  language text not null,
  format text not null check (format in ('epub','pdf')),
  drive_file_id text not null,
  file_name text not null,
  mime_type text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(book_id, language, format)
);

create index if not exists book_language_files_book_idx on public.book_language_files(book_id);
create index if not exists book_language_files_book_language_idx on public.book_language_files(book_id, language);
alter table public.book_language_files enable row level security;
revoke all on table public.book_language_files from anon, authenticated;
grant select on table public.book_language_files to authenticated;
grant all on table public.book_language_files to service_role;
drop policy if exists book_language_files_authenticated_read on public.book_language_files;
create policy book_language_files_authenticated_read on public.book_language_files for select to authenticated using (true);

insert into public.book_language_files(book_id,language,format,drive_file_id,file_name,mime_type)
select id, coalesce(nullif(lower(language),''),'pt'),
       case when mime_type='application/pdf' or lower(file_name) like '%.pdf' then 'pdf' else 'epub' end,
       drive_file_id,file_name,
       case when mime_type='application/pdf' or lower(file_name) like '%.pdf' then 'application/pdf' else 'application/epub+zip' end
from public.books
where drive_file_id is not null and file_name is not null
on conflict (book_id,language,format) do nothing;

insert into public.book_language_files(book_id,language,format,drive_file_id,file_name,mime_type)
select id, coalesce(nullif(lower(language),''),'pt'),'pdf',reading_pdf_drive_file_id,reading_pdf_file_name,'application/pdf'
from public.books
where reading_pdf_drive_file_id is not null and reading_pdf_file_name is not null
on conflict (book_id,language,format) do update set drive_file_id=excluded.drive_file_id,file_name=excluded.file_name,mime_type=excluded.mime_type,updated_at=now();
