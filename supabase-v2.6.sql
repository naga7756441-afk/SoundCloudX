-- SoundCloudX v2.6 update: gift variants (Gold / Silver / Toxic / your own), craft, tickets hidden in songs
-- Supabase → SQL Editor → New query → paste everything → Run   (needs v1.7 … v2.3 first). Safe to run again.
-- The server only keeps WHICH variant a gift has + the variant's colors. Everything you see is drawn by SCX itself.

-- ---------------------------------------------------------------- new kinds
alter table public.shop_items drop constraint if exists shop_items_kind_check;
alter table public.shop_items add constraint shop_items_kind_check
  check (kind in ('tag', 'image', 'gif', 'theme', 'frame', 'gift', 'pack', 'variant', 'ticket'));
alter table public.gifts drop constraint if exists gifts_kind_check;
alter table public.gifts add constraint gifts_kind_check check (kind in ('gift', 'tag', 'frame', 'coins', 'pack', 'ticket'));
alter table public.gifts add column if not exists variant bigint; -- plain number (a 2nd link to shop_items would confuse the server's embeds)
alter table public.gifts drop constraint if exists gifts_variant_fkey;
alter table public.market add column if not exists variant bigint;

create table if not exists public.scx_boosts (       -- an activated ticket: + chance for one variant, used on the next craft / pack
  user_id uuid primary key references public.profiles(id) on delete cascade on update cascade,
  variant bigint not null,
  bonus numeric not null,
  created_at timestamptz not null default now()
);
create table if not exists public.ticket_claims (
  user_id uuid not null references public.profiles(id) on delete cascade on update cascade,
  ticket bigint not null,
  url text not null,
  day date not null,
  primary key (user_id, ticket, url, day)
);
alter table public.scx_boosts enable row level security;
alter table public.ticket_claims enable row level security;
drop function if exists public.scx_craft(bigint[]);
drop policy if exists "boost: own" on public.scx_boosts;
create policy "boost: own" on public.scx_boosts for select using (user_id = auth.uid());
revoke insert, update, delete on public.scx_boosts from anon, authenticated;
revoke all on public.ticket_claims from anon, authenticated;
grant select on public.scx_boosts to authenticated;

-- only real shop things can be bought with Buy
create or replace function public.scx_buy(item bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare p public.profiles; it public.shop_items; cost bigint;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into it from public.shop_items where id = item and active;
  if not found then raise exception 'This item is not in the shop anymore'; end if;
  if it.kind in ('gift', 'pack') then raise exception 'Gifts are sent with 🎁'; end if;
  if it.kind not in ('tag', 'image', 'gif', 'theme', 'frame') then raise exception 'This can''t be bought'; end if;
  if exists (select 1 from public.purchases where user_id = auth.uid() and item_id = item) then raise exception 'You already own this'; end if;
  select * into p from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Join SCX Online first'; end if;
  cost := public.scx_price(it.price, auth.uid());
  if p.balance < cost then raise exception 'Not enough coins'; end if;
  update public.profiles set spent = spent + cost where id = auth.uid();
  insert into public.purchases (user_id, item_id) values (auth.uid(), item);
  return p.balance - cost;
end $$;

-- ---------------------------------------------------------------- helpers
create or replace function public.scx_ticket_room(uid uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select 30 - (select count(*) from public.gifts where to_user = uid and kind = 'ticket')
$$;
create or replace function public.scx_room_for(uid uuid, k text) returns bigint
language sql stable security definer set search_path = public as $$
  select case when k = 'ticket' then public.scx_ticket_room(uid) else public.scx_gift_room(uid) end
$$;

-- roll a variant (chance of each variant in %, + the activated ticket). The ticket is used up.
create or replace function public.scx_roll_variant(uid uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare b public.scx_boosts; v record; r numeric := random() * 100; cum numeric := 0; res bigint;
begin
  select * into b from public.scx_boosts where user_id = uid;
  for v in
    select id, case when (data->>'chance') ~ '^[0-9]{1,3}(\.[0-9]+)?$' then (data->>'chance')::numeric else 0 end as ch
    from public.shop_items where kind = 'variant' and active order by id
  loop
    cum := cum + least(greatest(v.ch + case when b.variant = v.id then b.bonus else 0 end, 0), 100);
    if r < cum then res := v.id; exit; end if;
  end loop;
  delete from public.scx_boosts where user_id = uid;
  return res;
end $$;

-- ---------------------------------------------------------------- packs now can give a variant
create or replace function public.scx_open_pack(gift bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g public.gifts; pick public.shop_items; pick_id bigint; n bigint; last timestamptz; vr bigint;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into g from public.gifts where id = gift and to_user = auth.uid() and kind = 'pack' for update;
  if not found then raise exception 'This is not your pack'; end if;
  if exists (select 1 from public.market where gift_id = gift) then raise exception 'It is on the market — take it off first'; end if;
  insert into public.scx_cooldown (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select pack_at into last from public.scx_cooldown where user_id = auth.uid() for update;
  if last is not null and last > now() - interval '10 seconds' then
    raise exception 'Wait % s before the next pack', ceil(extract(epoch from (last + interval '10 seconds' - now())));
  end if;
  update public.scx_cooldown set pack_at = now() where user_id = auth.uid();
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
  vr := public.scx_roll_variant(auth.uid());
  update public.gifts set kind = 'gift', item_id = pick.id, name = pick.name, data = pick.data, num = n, pinned = null, variant = vr
    where id = g.id;
  return jsonb_build_object('id', g.id, 'item', pick.id, 'name', pick.name, 'data', pick.data, 'num', n, 'variant', vr);
end $$;

-- ---------------------------------------------------------------- craft: 3 gifts of one rarity → 1 gift of the next rarity
create or replace function public.scx_craft(ids bigint[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rar text; nxt text; cnt int; pick public.shop_items; n bigint; vr bigint; gid bigint;
  ord text[] := array['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'divine'];
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if ids is null or array_length(ids, 1) <> 3 or (select count(distinct x) from unnest(ids) x) <> 3 then
    raise exception 'Pick 3 gifts';
  end if;
  select count(*), min(coalesce(data->>'rarity', 'common')), count(distinct coalesce(data->>'rarity', 'common'))
    into cnt, rar, n
    from public.gifts where id = any(ids) and to_user = auth.uid() and kind = 'gift';
  if cnt <> 3 then raise exception 'These are not 3 of your gifts'; end if;
  if n <> 1 then raise exception 'All 3 gifts must have the same rarity'; end if;
  if exists (select 1 from public.market where gift_id = any(ids)) then raise exception 'Take them off the market first'; end if;
  if array_position(ord, rar) is null or rar = 'divine' then raise exception 'Divine gifts can''t be crafted'; end if;
  nxt := ord[array_position(ord, rar) + 1];
  select * into pick from public.shop_items
    where kind = 'gift' and active and coalesce(data->>'rarity', 'common') = nxt and (supply is null or sold < supply)
    order by random() limit 1 for update;
  if not found then raise exception 'No % gifts to craft right now', nxt; end if;
  delete from public.gifts where id = any(ids);
  update public.shop_items set sold = sold + 1 where id = pick.id returning sold into n;
  vr := public.scx_roll_variant(auth.uid());
  insert into public.gifts (item_id, kind, name, data, num, to_user, note, variant)
    values (pick.id, 'gift', pick.name, pick.data, n, auth.uid(), 'Crafted', vr) returning id into gid;
  return jsonb_build_object('id', gid, 'item', pick.id, 'name', pick.name, 'data', pick.data, 'num', n, 'variant', vr);
end $$;

-- ---------------------------------------------------------------- tickets hidden in songs
-- Which songs have a ticket today is the same for everybody: hash(song + date + ticket) < chance %.
-- SCX finds them itself; the server only checks it again when you collect one (max 3 a day).
create or replace function public.scx_ticket_roll(url text, ticket bigint) returns numeric
language sql stable set search_path = public as $$
  select (('x' || substr(encode(sha256(convert_to(url || ':' || to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD') || ':' || ticket::text, 'UTF8')), 'hex'), 1, 8))::bit(32)::bigint)::numeric / 4294967296 * 100
$$;

create or replace function public.scx_claim_ticket(url text, ticket bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.shop_items; ch numeric; today date := (now() at time zone 'utc')::date; gid bigint;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid()) then raise exception 'Join SCX Online first'; end if;
  if url is null or url !~ '^https://soundcloud\.com/[a-z0-9_-]{1,60}/[a-z0-9_-]{1,120}$' then raise exception 'Not a song'; end if;
  select * into t from public.shop_items where id = ticket and kind = 'ticket' and active;
  if not found then raise exception 'This ticket does not exist'; end if;
  ch := case when (t.data->>'chance') ~ '^[0-9]{1,3}(\.[0-9]+)?$' then (t.data->>'chance')::numeric else 0 end;
  if public.scx_ticket_roll(url, ticket) >= ch then raise exception 'No ticket in this song'; end if;
  if exists (select 1 from public.ticket_claims where user_id = auth.uid() and ticket_claims.ticket = scx_claim_ticket.ticket
             and ticket_claims.url = scx_claim_ticket.url and day = today) then raise exception 'You already took this ticket'; end if;
  if (select count(*) from public.ticket_claims where user_id = auth.uid() and day = today) >= 3 then raise exception 'Max 3 tickets a day'; end if;
  if public.scx_ticket_room(auth.uid()) <= 0 then raise exception 'Max 30 tickets — use or sell some first'; end if;
  insert into public.ticket_claims values (auth.uid(), ticket, url, today);
  insert into public.gifts (item_id, kind, name, data, to_user, note) values (t.id, 'ticket', t.name, t.data, auth.uid(), 'Found in a song')
    returning id into gid;
  return jsonb_build_object('id', gid, 'name', t.name, 'data', t.data);
end $$;

create or replace function public.scx_activate_ticket(gift bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g public.gifts; v public.shop_items; vid bigint; bonus numeric;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into g from public.gifts where id = gift and to_user = auth.uid() and kind = 'ticket' for update;
  if not found then raise exception 'This is not your ticket'; end if;
  if exists (select 1 from public.market where gift_id = gift) then raise exception 'It is on the market — take it off first'; end if;
  vid := case when (g.data->>'variant') ~ '^[0-9]{1,18}$' then (g.data->>'variant')::bigint end;
  select * into v from public.shop_items where id = vid and kind = 'variant';
  if not found then raise exception 'The variant of this ticket does not exist anymore'; end if;
  bonus := least(greatest(case when (g.data->>'bonus') ~ '^[0-9]{1,3}(\.[0-9]+)?$' then (g.data->>'bonus')::numeric else 10 end, 0), 100);
  delete from public.gifts where id = gift;
  insert into public.scx_boosts (user_id, variant, bonus) values (auth.uid(), vid, bonus)
    on conflict (user_id) do update set variant = excluded.variant, bonus = excluded.bonus, created_at = now();
  return jsonb_build_object('variant', vid, 'name', v.name, 'bonus', bonus);
end $$;

-- ---------------------------------------------------------------- giving / selling also works for tickets
create or replace function public.scx_transfer_gift(gift bigint, target uuid, note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare g public.gifts; me public.profiles; clean text := nullif(left(trim(coalesce(note, '')), 200), '');
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if target = auth.uid() then raise exception 'It is already yours'; end if;
  select * into g from public.gifts where id = gift and to_user = auth.uid() and kind in ('gift', 'pack', 'ticket') for update;
  if not found then raise exception 'This is not your gift'; end if;
  if exists (select 1 from public.market where gift_id = gift) then raise exception 'It is on the market — take it off first'; end if;
  if not exists (select 1 from public.profiles where id = target) then raise exception 'User not found'; end if;
  if public.scx_room_for(target, g.kind) <= 0 then raise exception 'Their gift box is full'; end if;
  select * into me from public.profiles where id = auth.uid();
  update public.gifts set to_user = target, from_user = auth.uid(), note = clean, pinned = null, created_at = now() where id = gift;
  insert into public.messages (to_user, text, kind)
    values (target, left('🎁 ' || me.nick || ' sent you ' || g.name || coalesce(' #' || g.num, '') || coalesce(' — "' || clean || '"', ''), 500), 'gift');
end $$;

create or replace function public.scx_market_list(gift bigint, price bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare g public.gifts; lid bigint;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if price is null or price < 1 or price > 100000000 then raise exception 'Price: 1 – 100 000 000'; end if;
  select * into g from public.gifts where id = gift and to_user = auth.uid() and kind in ('gift', 'pack', 'ticket') for update;
  if not found then raise exception 'This is not your gift'; end if;
  if exists (select 1 from public.market where gift_id = gift) then raise exception 'Already on the market'; end if;
  if (select count(*) from public.market where seller = auth.uid()) >= 10 then raise exception 'Max 10 things on the market'; end if;
  update public.gifts set pinned = null where id = gift;
  insert into public.market (gift_id, seller, price, kind, name, data, num, variant)
    values (gift, auth.uid(), price, g.kind, g.name, g.data, g.num, g.variant) returning id into lid;
  return lid;
end $$;

create or replace function public.scx_market_buy(listing bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare l public.market; me public.profiles;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into l from public.market where id = listing for update;
  if not found then raise exception 'Somebody was faster — it is sold'; end if;
  if l.seller = auth.uid() then raise exception 'This is yours'; end if;
  if not exists (select 1 from public.gifts where id = l.gift_id and to_user = l.seller) then
    delete from public.market where id = listing;
    raise exception 'This is not for sale anymore';
  end if;
  if public.scx_room_for(auth.uid(), l.kind) <= 0 then raise exception 'Your gift box is full — sell or give some gifts away first'; end if;
  select * into me from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Join SCX Online first'; end if;
  if me.balance < l.price then raise exception 'Not enough coins'; end if;
  update public.profiles set spent = spent + l.price where id = auth.uid();
  update public.profiles set bonus = bonus + l.price where id = l.seller;
  update public.gifts set to_user = auth.uid(), from_user = l.seller, note = null, pinned = null, created_at = now() where id = l.gift_id;
  delete from public.market where id = listing;
  insert into public.messages (to_user, text, kind)
    values (l.seller, left('💰 ' || me.nick || ' bought your ' || l.name || coalesce(' #' || l.num, '') || ' for ' || l.price || ' coins', 500), 'gift');
  return me.balance - l.price;
end $$;

revoke execute on function public.scx_roll_variant(uuid) from public, anon, authenticated;
revoke execute on function public.scx_craft(bigint[]) from public, anon;
revoke execute on function public.scx_claim_ticket(text, bigint) from public, anon;
revoke execute on function public.scx_activate_ticket(bigint) from public, anon;
grant execute on function public.scx_craft(bigint[]) to authenticated;
grant execute on function public.scx_claim_ticket(text, bigint) to authenticated;
grant execute on function public.scx_activate_ticket(bigint) to authenticated;
grant execute on function public.scx_ticket_roll(text, bigint) to authenticated;

-- ---------------------------------------------------------------- starter variants + their tickets (only if there are none)
insert into public.shop_items (kind, name, price, data)
select * from (values
  ('variant', '✨ Gold',   0::bigint, '{"style":"gold","c1":"#ffd700","c2":"#b8860b","effect":"shine","chance":4}'::jsonb),
  ('variant', '🥈 Silver', 0,         '{"style":"silver","c1":"#f1f5f9","c2":"#94a3b8","effect":"shine","chance":8}'),
  ('variant', '☢️ Toxic',  0,         '{"style":"toxic","c1":"#a3ff12","c2":"#22c55e","effect":"toxic","chance":2}')
) as v(kind, name, price, data)
where not exists (select 1 from public.shop_items where kind = 'variant');

insert into public.shop_items (kind, name, price, data)
select 'ticket', t.name, 0, jsonb_build_object('emoji', t.emoji, 'variant', s.id, 'bonus', t.bonus, 'chance', t.chance)
from (values ('🎫 Gold ticket', '🎫', '✨ Gold', 20, 2), ('🎟️ Silver ticket', '🎟️', '🥈 Silver', 25, 3), ('🧪 Toxic ticket', '🧪', '☢️ Toxic', 15, 1.5))
  as t(name, emoji, vname, bonus, chance)
join public.shop_items s on s.kind = 'variant' and s.name = t.vname
where not exists (select 1 from public.shop_items where kind = 'ticket');
