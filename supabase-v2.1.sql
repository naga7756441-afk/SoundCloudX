-- SoundCloudX v2.1 update: nick without upper/lower case, pass gifts on, recovery code, gift packs
-- Supabase → SQL Editor → New query → paste everything → Run
-- (needs supabase-v1.7 … v2.0 first). Safe to run again.

-- ---------------------------------------------------------------- 1) nick: "W1CKIX" and "w1ckix" are the same nick now
-- if two people already have the same nick in different case, the newer one gets a number at the end
update public.profiles p set nick = left(p.nick, 15) || '_' || substr(md5(p.id::text), 1, 4)
where exists (select 1 from public.profiles o where lower(o.nick) = lower(p.nick) and o.id <> p.id
              and (o.created_at < p.created_at or (o.created_at = p.created_at and o.id < p.id)));
create unique index if not exists profiles_nick_nocase on public.profiles (lower(nick));

-- ---------------------------------------------------------------- 2) gift packs in the shop
alter table public.shop_items drop constraint if exists shop_items_kind_check;
alter table public.shop_items add constraint shop_items_kind_check check (kind in ('tag', 'image', 'gif', 'theme', 'frame', 'gift', 'pack'));
alter table public.gifts drop constraint if exists gifts_kind_check;
alter table public.gifts add constraint gifts_kind_check check (kind in ('gift', 'tag', 'frame', 'coins', 'pack'));

-- gifts and packs are sent with 🎁, not bought with Buy
create or replace function public.scx_buy(item bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare p public.profiles; it public.shop_items;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into it from public.shop_items where id = item and active;
  if not found then raise exception 'This item is not in the shop anymore'; end if;
  if it.kind in ('gift', 'pack') then raise exception 'Gifts are sent with 🎁'; end if;
  if exists (select 1 from public.purchases where user_id = auth.uid() and item_id = item) then
    raise exception 'You already own this';
  end if;
  select * into p from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Join SCX Online first'; end if;
  if p.balance < it.price then raise exception 'Not enough coins'; end if;
  update public.profiles set spent = spent + it.price where id = auth.uid();
  insert into public.purchases (user_id, item_id) values (auth.uid(), item);
  return p.balance - it.price;
end $$;

-- send (or buy for yourself) a gift, pack, tag or frame
create or replace function public.scx_gift(item bigint, target uuid, note text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare me public.profiles; it public.shop_items; n bigint; clean text := nullif(left(trim(coalesce(note, '')), 200), '');
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into it from public.shop_items where id = item and active for update;
  if not found then raise exception 'This item is not in the shop anymore'; end if;
  if it.kind not in ('gift', 'pack', 'tag', 'frame') then raise exception 'This can''t be sent as a gift'; end if;
  if not exists (select 1 from public.profiles where id = target) then raise exception 'User not found'; end if;
  if it.kind in ('tag', 'frame') then
    if target = auth.uid() then raise exception 'Buy it for yourself in the Shop'; end if;
    if exists (select 1 from public.purchases where user_id = target and item_id = item) then raise exception 'They already have this'; end if;
  end if;
  if it.supply is not null and it.sold >= it.supply then raise exception 'Sold out'; end if;
  select * into me from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Join SCX Online first'; end if;
  if me.balance < it.price then raise exception 'Not enough coins'; end if;
  update public.profiles set spent = spent + it.price where id = auth.uid();
  update public.shop_items set sold = sold + 1 where id = item returning sold into n;
  if it.kind in ('tag', 'frame') then insert into public.purchases (user_id, item_id) values (target, item); end if;
  insert into public.gifts (item_id, kind, name, data, num, from_user, to_user, note)
    values (item, it.kind, it.name, it.data, case when it.kind = 'pack' then null else n end, auth.uid(), target, clean);
  if target <> auth.uid() then
    insert into public.messages (to_user, text, kind)
      values (target, left('🎁 ' || me.nick || ' sent you ' || it.name || coalesce(' — "' || clean || '"', ''), 500), 'gift');
  end if;
  return me.balance - it.price;
end $$;

-- open a pack you have → one of the gifts the admin put in it (chance = weight)
create or replace function public.scx_open_pack(gift bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g public.gifts; pick public.shop_items; pick_id bigint; n bigint;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into g from public.gifts where id = gift and to_user = auth.uid() and kind = 'pack' for update;
  if not found then raise exception 'This is not your pack'; end if;
  -- the pool: [{"item": 12, "weight": 60}, …] — only gifts that are still in the shop and not sold out
  with pool as (
    select s.id as item, greatest(least(coalesce(case when (p->>'weight') ~ '^[0-9]{1,7}(\.[0-9]+)?$' then (p->>'weight')::numeric end, 1), 1000000), 0) as weight
    from jsonb_array_elements(case when jsonb_typeof(g.data->'pool') = 'array' then g.data->'pool' else '[]'::jsonb end) p
    join public.shop_items s on s.id = case when (p->>'item') ~ '^[0-9]{1,18}$' then (p->>'item')::bigint end
    where s.kind = 'gift' and s.active and (s.supply is null or s.sold < s.supply)
  ), t as (
    select item, sum(weight) over (order by item) as cum, sum(weight) over () as tot from pool where weight > 0
  ), r as (select random() * max(tot) as v from t)
  select t.item into pick_id from t, r where t.cum > r.v order by t.cum limit 1;
  if pick_id is null then raise exception 'This pack is empty right now — try later'; end if;
  select * into pick from public.shop_items where id = pick_id for update;
  update public.shop_items set sold = sold + 1 where id = pick.id returning sold into n;
  update public.gifts set kind = 'gift', item_id = pick.id, name = pick.name, data = pick.data, num = n, pinned = null
    where id = g.id;
  return jsonb_build_object('id', g.id, 'item', pick.id, 'name', pick.name, 'data', pick.data, 'num', n);
end $$;

-- ---------------------------------------------------------------- 3) pass a gift / pack you have to someone else
create or replace function public.scx_transfer_gift(gift bigint, target uuid, note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare g public.gifts; me public.profiles; clean text := nullif(left(trim(coalesce(note, '')), 200), '');
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if target = auth.uid() then raise exception 'It is already yours'; end if;
  select * into g from public.gifts where id = gift and to_user = auth.uid() and kind in ('gift', 'pack') for update;
  if not found then raise exception 'This is not your gift'; end if;
  if not exists (select 1 from public.profiles where id = target) then raise exception 'User not found'; end if;
  select * into me from public.profiles where id = auth.uid();
  update public.gifts set to_user = target, from_user = auth.uid(), note = clean, pinned = null, created_at = now() where id = gift;
  insert into public.messages (to_user, text, kind)
    values (target, left('🎁 ' || me.nick || ' sent you ' || g.name || coalesce(' #' || g.num, '') || coalesce(' — "' || clean || '"', ''), 500), 'gift');
end $$;

-- ---------------------------------------------------------------- 4) recovery code (get your account back on a new PC)
-- everything that points to a profile follows it when the profile moves to the new PC
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname, pg_get_constraintdef(c.oid) as def
    from pg_constraint c
    where c.confrelid = 'public.profiles'::regclass and c.contype = 'f' and c.confupdtype <> 'c'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I %s on update cascade', r.tbl, r.conname, r.def);
  end loop;
end $$;

create table if not exists public.scx_recovery (
  user_id uuid primary key references public.profiles(id) on delete cascade on update cascade,
  code_hash bytea not null unique,
  created_at timestamptz not null default now()
);
alter table public.scx_recovery enable row level security; -- no policies: nobody can read it, only the functions below
revoke all on public.scx_recovery from anon, authenticated;

-- make a new code (the old one stops working). The code is shown once and only its hash is kept
create or replace function public.scx_make_recovery_code() returns text
language plpgsql security definer set search_path = public as $$
declare raw text; code text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid()) then raise exception 'Join SCX Online first'; end if;
  raw := upper(translate(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), '01', 'XY'));
  code := 'SCX-' || substr(raw, 1, 5) || '-' || substr(raw, 6, 5) || '-' || substr(raw, 11, 5) || '-' || substr(raw, 16, 5);
  insert into public.scx_recovery (user_id, code_hash) values (auth.uid(), sha256(convert_to(code, 'UTF8')))
    on conflict (user_id) do update set code_hash = excluded.code_hash, created_at = now();
  return code;
end $$;

-- on the new PC: move the old profile (coins, gifts, followers, everything) to this PC
create or replace function public.scx_recover(code text) returns void
language plpgsql security definer set search_path = public as $$
declare old_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  perform pg_sleep(0.3); -- makes guessing codes slow
  select user_id into old_id from public.scx_recovery
    where code_hash = sha256(convert_to(upper(trim(coalesce(code, ''))), 'UTF8'));
  if old_id is null then raise exception 'Wrong recovery code'; end if;
  if old_id = auth.uid() then return; end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'This PC already has a SCX profile';
  end if;
  update public.profiles set id = auth.uid() where id = old_id;
end $$;

revoke execute on function public.scx_open_pack(bigint) from public, anon;
revoke execute on function public.scx_transfer_gift(bigint, uuid, text) from public, anon;
revoke execute on function public.scx_make_recovery_code() from public, anon;
revoke execute on function public.scx_recover(text) from public, anon;
grant execute on function public.scx_open_pack(bigint) to authenticated;
grant execute on function public.scx_transfer_gift(bigint, uuid, text) to authenticated;
grant execute on function public.scx_make_recovery_code() to authenticated;
grant execute on function public.scx_recover(text) to authenticated;

-- ---------------------------------------------------------------- starter pack (only if there are no packs yet)
insert into public.shop_items (kind, name, price, data)
select 'pack', '🎁 Mystery Pack', 3000, jsonb_build_object('emoji', '🎁', 'pool', coalesce((
  select jsonb_agg(jsonb_build_object('item', s.id, 'weight', w.weight) order by s.price)
  from public.shop_items s
  join (values ('🌹 Rose', 40), ('🍀 Clover', 30), ('🎧 Headphones', 15), ('💎 Diamond', 9), ('🔮 Crystal Ball', 5), ('👑 Crown', 1)) as w(name, weight)
    on w.name = s.name and s.kind = 'gift'), '[]'::jsonb))
where not exists (select 1 from public.shop_items where kind = 'pack');
