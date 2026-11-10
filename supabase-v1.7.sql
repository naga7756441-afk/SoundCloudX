-- SoundCloudX v1.7 update for SCX Online: coins, stats, SoundCloud link
-- Supabase → SQL Editor → New query → paste everything → Run

alter table public.profiles
  add column if not exists coins bigint not null default 0 check (coins >= 0),
  add column if not exists stats jsonb not null default '{}'::jsonb check (pg_column_size(stats) < 4000),
  add column if not exists sc_url text check (sc_url is null or sc_url ~ '^https://soundcloud\.com/[A-Za-z0-9_-]{1,60}$'),
  add column if not exists scx_version text check (scx_version is null or length(scx_version) <= 20),
  add column if not exists updated_at timestamptz not null default now();

-- light anti-cheat: coins never go down, grow by at most 100 000 per save, and at most one coin save every 10 s
create or replace function public.scx_guard_profile() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.coins := least(greatest(new.coins, 0), 100000);
  else
    if new.coins < old.coins then new.coins := old.coins; end if;
    if new.coins - old.coins > 100000 then new.coins := old.coins + 100000; end if;
    if new.coins <> old.coins and old.updated_at > now() - interval '10 seconds' then new.coins := old.coins; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists scx_guard_profile on public.profiles;
create trigger scx_guard_profile before insert or update on public.profiles
  for each row execute function public.scx_guard_profile();

-- "online" time always comes from the server clock
create or replace function public.scx_touch() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists scx_touch on public.presence;
create trigger scx_touch before insert or update on public.presence
  for each row execute function public.scx_touch();

-- a best score never goes down
create or replace function public.scx_best() returns trigger
language plpgsql set search_path = public as $$
begin new.best := greatest(new.best, old.best); new.updated_at := now(); return new; end $$;
drop trigger if exists scx_best on public.scores;
create trigger scx_best before update on public.scores
  for each row execute function public.scx_best();
