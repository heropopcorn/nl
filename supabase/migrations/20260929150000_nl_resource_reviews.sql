-- Isolated from imageHandle's users, stamps and Storage. Apply once after resume.
begin;
create table if not exists public.nl_resource_reviews (
  namespace text not null check (namespace ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  asset_id text not null check (asset_id ~ '^[a-f0-9]{64}$'),
  name text not null check (length(name) between 1 and 255),
  kind text not null check (kind in ('image','animation','video')),
  mime text not null,
  bytes bigint not null check (bytes > 0 and bytes <= 52428800),
  status text not null default 'pending' check (status in ('pending','usable','unusable')),
  note text not null default '' check (length(note) <= 2000),
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_by text,
  primary key (namespace, asset_id)
);
create table if not exists public.nl_resource_review_events (
  namespace text not null, asset_id text not null, revision integer not null,
  previous_status text not null, status text not null, note text not null,
  reviewed_by text not null, created_at timestamptz not null default now(),
  primary key (namespace, asset_id, revision),
  foreign key (namespace, asset_id) references public.nl_resource_reviews(namespace,asset_id)
);
alter table public.nl_resource_reviews enable row level security;
alter table public.nl_resource_review_events enable row level security;
-- Browsers never access these tables directly. Existing app login gates the API.
revoke all on public.nl_resource_reviews, public.nl_resource_review_events from public, anon, authenticated;
grant select, insert, update on public.nl_resource_reviews to service_role;
grant select, insert on public.nl_resource_review_events to service_role;

create or replace function public.nl_review_decide(
  p_namespace text, p_asset_id text, p_status text, p_note text,
  p_revision integer, p_reviewer text
) returns jsonb
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare old_row public.nl_resource_reviews; new_row public.nl_resource_reviews;
begin
  if p_status not in ('pending','usable','unusable') or p_status is null
    or p_note is null or length(p_note)>2000 or p_reviewer is null or length(p_reviewer)>80 then
    raise exception 'Invalid review' using errcode='22023';
  end if;
  select * into old_row from public.nl_resource_reviews
    where namespace=p_namespace and asset_id=p_asset_id for update;
  if not found or old_row.revision is distinct from p_revision then
    raise exception 'Review changed; reload before saving' using errcode='40001';
  end if;
  update public.nl_resource_reviews set status=p_status, note=p_note,
    revision=revision+1, updated_at=now(), reviewed_by=p_reviewer
    where namespace=p_namespace and asset_id=p_asset_id returning * into new_row;
  insert into public.nl_resource_review_events(namespace,asset_id,revision,previous_status,status,note,reviewed_by)
    values(p_namespace,p_asset_id,new_row.revision,old_row.status,p_status,p_note,p_reviewer);
  return to_jsonb(new_row);
end;
$$;
revoke all on function public.nl_review_decide(text,text,text,text,integer,text) from public, anon, authenticated;
grant execute on function public.nl_review_decide(text,text,text,text,integer,text) to service_role;
commit;
