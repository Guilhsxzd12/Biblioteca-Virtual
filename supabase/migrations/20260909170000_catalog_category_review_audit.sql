create table if not exists private.catalog_category_review_audit (book_id uuid not null, reviewed_at timestamptz not null default now(), old_category_id uuid, new_category_id uuid not null, reason text not null, primary key(book_id,reviewed_at));
revoke all on private.catalog_category_review_audit from public,anon,authenticated;
