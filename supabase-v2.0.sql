-- SoundCloudX v2.0 update: gifts (coins / frames / tags / collectible gifts with rarity), picture frames
-- Supabase → SQL Editor → New query → paste everything → Run
-- (needs supabase-v1.7.sql, supabase-v1.8.sql and supabase-v1.9.sql first). Safe to run again.

-- ---------------------------------------------------------------- shop: gifts + limited amount
alter table public.shop_items drop constraint if exists shop_items_kind_check;
alter table public.shop_items add constraint shop_items_kind_check check (kind in ('tag', 'image', 'gif', 'theme', 'frame', 'gift'));
alter table public.shop_items add column if not exists supply bigint check (supply is null or supply between 1 and 1000000); -- empty = unlimited
alter table public.shop_items add column if not exists sold bigint not null default 0;

-- messages can now also be gift notifications (not only from SCX ADMIN)
alter table public.messages add column if not exists kind text not null default 'admin';
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind in ('admin', 'gift'));

-- ---------------------------------------------------------------- gifts people received
create table if not exists public.gifts (
  id bigint generated always as identity primary key,
  item_id bigint references public.shop_items(id) on delete set null,
  kind text not null check (kind in ('gift', 'tag', 'frame', 'coins')),
  name text not null check (length(name) between 1 and 60),
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) < 4000), -- copy of the item, so it stays even if the item is deleted
  num bigint,     -- "#12" = the 12th of this gift ever sent
  amount bigint,  -- coins
  from_user uuid references public.profiles(id) on delete set null,
  to_user uuid not null references public.profiles(id) on delete cascade,
  note text check (note is null or length(note) <= 200),
  pinned smallint check (pinned between 1 and 3), -- shown on the profile (max 3)
  created_at timestamptz not null default now()
);
create index if not exists gifts_to_user on public.gifts (to_user, created_at desc);
create unique index if not exists gifts_one_per_slot on public.gifts (to_user, pinned) where pinned is not null;

alter table public.gifts enable row level security;
drop policy if exists "gifts: read" on public.gifts;
-- you see gifts you got or sent; everybody sees gifts pinned on a profile
create policy "gifts: read" on public.gifts for select using (to_user = auth.uid() or from_user = auth.uid() or pinned is not null);
-- nobody writes directly: only through the functions below
revoke insert, update, delete on public.gifts from anon, authenticated;

-- gifts can't be bought with the normal Buy (they are sent with scx_gift)
create or replace function public.scx_buy(item bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare p public.profiles; it public.shop_items;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into it from public.shop_items where id = item and active;
  if not found then raise exception 'This item is not in the shop anymore'; end if;
  if it.kind = 'gift' then raise exception 'Gifts are sent with 🎁'; end if;
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

-- send a gift / tag / frame from the shop (you pay). target = yourself is ok for gifts
create or replace function public.scx_gift(item bigint, target uuid, note text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare me public.profiles; it public.shop_items; n bigint; clean text := nullif(left(trim(coalesce(note, '')), 200), '');
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into it from public.shop_items where id = item and active for update;
  if not found then raise exception 'This item is not in the shop anymore'; end if;
  if it.kind not in ('gift', 'tag', 'frame') then raise exception 'This can''t be sent as a gift'; end if;
  if not exists (select 1 from public.profiles where id = target) then raise exception 'User not found'; end if;
  if it.kind <> 'gift' then
    if target = auth.uid() then raise exception 'Buy it for yourself in the Shop'; end if;
    if exists (select 1 from public.purchases where user_id = target and item_id = item) then raise exception 'They already have this'; end if;
  end if;
  if it.supply is not null and it.sold >= it.supply then raise exception 'Sold out'; end if;
  select * into me from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Join SCX Online first'; end if;
  if me.balance < it.price then raise exception 'Not enough coins'; end if;
  update public.profiles set spent = spent + it.price where id = auth.uid();
  update public.shop_items set sold = sold + 1 where id = item returning sold into n;
  if it.kind <> 'gift' then insert into public.purchases (user_id, item_id) values (target, item); end if;
  insert into public.gifts (item_id, kind, name, data, num, from_user, to_user, note)
    values (item, it.kind, it.name, it.data, n, auth.uid(), target, clean);
  if target <> auth.uid() then
    insert into public.messages (to_user, text, kind)
      values (target, left('🎁 ' || me.nick || ' sent you ' || it.name || coalesce(' — "' || clean || '"', ''), 500), 'gift');
  end if;
  return me.balance - it.price;
end $$;

-- send coins to someone
create or replace function public.scx_send_coins(target uuid, amount bigint, note text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare me public.profiles; clean text := nullif(left(trim(coalesce(note, '')), 200), '');
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if target = auth.uid() then raise exception 'You can''t send coins to yourself'; end if;
  if amount is null or amount < 1 or amount > 1000000 then raise exception 'Amount: 1 – 1 000 000'; end if;
  select * into me from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Join SCX Online first'; end if;
  if me.balance < amount then raise exception 'Not enough coins'; end if;
  update public.profiles set bonus = bonus + amount where id = target;
  if not found then raise exception 'User not found'; end if;
  update public.profiles set spent = spent + amount where id = auth.uid();
  insert into public.gifts (kind, name, amount, from_user, to_user, note)
    values ('coins', amount || ' coins', amount, auth.uid(), target, clean);
  insert into public.messages (to_user, text, kind)
    values (target, left('🪙 ' || me.nick || ' sent you ' || amount || ' coins' || coalesce(' — "' || clean || '"', ''), 500), 'gift');
  return me.balance - amount;
end $$;

-- pin a gift you got on your profile (slot 1–3), slot null = unpin
create or replace function public.scx_pin_gift(gift bigint, slot smallint default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if slot is not null and (slot < 1 or slot > 3) then raise exception 'Max 3 gifts on the profile'; end if;
  if not exists (select 1 from public.gifts where id = gift and to_user = auth.uid() and kind = 'gift') then
    raise exception 'This is not your gift';
  end if;
  if slot is null then update public.gifts set pinned = null where id = gift; return; end if;
  update public.gifts set pinned = null where to_user = auth.uid() and (pinned = slot or id = gift);
  update public.gifts set pinned = slot where id = gift;
end $$;

-- frames can now be a picture / GIF around (or behind) the profile picture, like Discord decorations
create or replace function public.scx_equip_frame(item bigint) returns void
language plpgsql security definer set search_path = public as $$
declare it public.shop_items; sc numeric;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if item is null then update public.profiles set frame = null where id = auth.uid(); return; end if;
  select s.* into it from public.shop_items s
    join public.purchases b on b.item_id = s.id and b.user_id = auth.uid()
    where s.id = item and s.kind = 'frame';
  if not found then raise exception 'Buy this frame first'; end if;
  if it.data->>'style' = 'image' then
    if coalesce(it.data->>'url', '') not like 'https://%' or length(it.data->>'url') > 500 then raise exception 'This frame has no picture'; end if;
    sc := case when (it.data->>'scale') ~ '^[0-9]+(\.[0-9]+)?$' then least(greatest((it.data->>'scale')::numeric, 1.0), 1.8) else 1.3 end;
    update public.profiles set frame = jsonb_build_object(
        'style', 'image', 'url', it.data->>'url', 'scale', sc,
        'layer', case when it.data->>'layer' = 'over' then 'over' else 'behind' end,
        'name', it.name)
      where id = auth.uid();
  else
    update public.profiles set frame = jsonb_build_object(
        'style', coalesce(nullif(it.data->>'style', ''), 'gradient'),
        'colors', coalesce(it.data->'colors', '["#ff5500","#ffb347"]'::jsonb),
        'name', it.name)
      where id = auth.uid();
  end if;
end $$;

revoke execute on function public.scx_gift(bigint, uuid, text) from public, anon;
revoke execute on function public.scx_send_coins(uuid, bigint, text) from public, anon;
revoke execute on function public.scx_pin_gift(bigint, smallint) from public, anon;
grant execute on function public.scx_gift(bigint, uuid, text) to authenticated;
grant execute on function public.scx_send_coins(uuid, bigint, text) to authenticated;
grant execute on function public.scx_pin_gift(bigint, smallint) to authenticated;
grant select on public.gifts to authenticated;

-- ---------------------------------------------------------------- starter gifts (only if there are no gifts yet)
-- rarity: common · uncommon · rare · epic · legendary · mythic · divine
insert into public.shop_items (kind, name, price, supply, data)
select * from (values
  ('gift', '🌹 Rose',          500::bigint,  null::bigint, '{"emoji":"🌹","rarity":"common"}'::jsonb),
  ('gift', '🍀 Clover',        800,     null, '{"emoji":"🍀","rarity":"common"}'),
  ('gift', '🎧 Headphones',    2000,    null, '{"emoji":"🎧","rarity":"uncommon"}'),
  ('gift', '🍰 Cake',          2500,    null, '{"emoji":"🍰","rarity":"uncommon"}'),
  ('gift', '💎 Diamond',       6000,    null, '{"emoji":"💎","rarity":"rare"}'),
  ('gift', '🎸 Guitar',        7000,    null, '{"emoji":"🎸","rarity":"rare"}'),
  ('gift', '🔮 Crystal Ball',  15000,   1000, '{"emoji":"🔮","rarity":"epic"}'),
  ('gift', '🦄 Unicorn',       18000,   1000, '{"emoji":"🦄","rarity":"epic"}'),
  ('gift', '👑 Crown',         40000,   500,  '{"emoji":"👑","rarity":"legendary"}'),
  ('gift', '🏆 Trophy',        50000,   300,  '{"emoji":"🏆","rarity":"legendary"}'),
  ('gift', '🐉 Dragon',        100000,  100,  '{"emoji":"🐉","rarity":"mythic"}'),
  ('gift', '🌌 Galaxy',        250000,  25,   '{"emoji":"🌌","rarity":"divine"}')
) as v(kind, name, price, supply, data)
where not exists (select 1 from public.shop_items where kind = 'gift');
