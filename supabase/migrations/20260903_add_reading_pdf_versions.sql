alter table public.books add column if not exists reading_pdf_drive_file_id text;
alter table public.books add column if not exists reading_pdf_file_name text;
alter table public.books add column if not exists reading_pdf_generated_at timestamptz;
alter table public.user_books add column if not exists reading_pdf_drive_file_id text;
alter table public.user_books add column if not exists reading_pdf_file_name text;
alter table public.user_books add column if not exists reading_pdf_generated_at timestamptz;
