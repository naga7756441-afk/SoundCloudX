-- SoundCloudX v2.2 update: Premium, gift market, promo codes, max gifts, pack cooldown
-- Supabase → SQL Editor → New query → paste everything → Run
-- (needs supabase-v1.7 … v2.1 first). Safe to run again.

-- ---------------------------------------------------------------- Premium (bought for coins, forever)
alter table public.profiles add column if not exists premium boolean not null default false;

create or replace function public.scx_guard_profile() returns trigger
language plpgsql set search_path = public as $$
declare
  trusted boolean := current_user in ('postgres', 'supabase_admin', 'service_role');
begin
  if tg_op = 'INSERT' then
    new.coins := least(greatest(new.coins, 0), 100000);
    if not trusted then
      new.bonus := 0; new.spent := 0; new.tag_text := null; new.tag_color := null; new.is_admin := false;
      new.frame := null; new.profile_bg := null; new.premium := false;
    end if;
  else
    if new.coins < old.coins then new.coins := old.coins; end if;
    if new.coins - old.coins > 100000 then new.coins := old.coins + 100000; end if;
    if new.coins <> old.coins and old.updated_at > now() - interval '10 seconds' then new.coins := old.coins; end if;
    if not trusted then
      new.bonus := old.bonus; new.spent := old.spent;
      new.tag_text := old.tag_text; new.tag_color := old.tag_color;
      new.is_admin := old.is_admin;
      new.frame := old.frame; new.profile_bg := old.profile_bg;
      new.premium := old.premium;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- shop price for this user (Premium = 10% off)
create or replace function public.scx_price(base bigint, uid uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select case when coalesce((select premium from public.profiles where id = uid), false) then ceil(base * 0.9)::bigint else base end
$$;

-- how many more gifts / packs this user can hold (50, Premium 100)
create or replace function public.scx_gift_room(uid uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select (case when coalesce((select premium from public.profiles where id = uid), false) then 100 else 50 end)
       - (select count(*) from public.gifts where to_user = uid and kind in ('gift', 'pack'))
$$;

create or replace function public.scx_buy_premium() returns bigint
language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into me from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Join SCX Online first'; end if;
  if me.premium then raise exception 'You already have Premium'; end if;
  if me.balance < 1000000 then raise exception 'Not enough coins'; end if;
  update public.profiles set spent = spent + 1000000, premium = true where id = auth.uid();
  return me.balance - 1000000;
end $$;

-- ---------------------------------------------------------------- market (each person: max 10 things for sale)
create table if not exists public.market (
  id bigint generated always as identity primary key,
  gift_id bigint not null unique references public.gifts(id) on delete cascade,
  seller uuid not null references public.profiles(id) on delete cascade on update cascade,
  price bigint not null check (price between 1 and 100000000),
  kind text not null, name text not null, data jsonb not null default '{}'::jsonb, num bigint, -- copy, so buyers can see it
  created_at timestamptz not null default now()
);
create index if not exists market_seller on public.market (seller);
alter table public.market enable row level security;
drop policy if exists "market: read" on public.market;
create policy "market: read" on public.market for select using (true);
revoke insert, update, delete on public.market from anon, authenticated;
grant select on public.market to authenticated;

-- cooldowns (opening packs)
create table if not exists public.scx_cooldown (
  user_id uuid primary key references public.profiles(id) on delete cascade on update cascade,
  pack_at timestamptz
);
alter table public.scx_cooldown enable row level security;
revoke all on public.scx_cooldown from anon, authenticated;

-- ---------------------------------------------------------------- shop functions with Premium price + gift limit
create or replace function public.scx_buy(item bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare p public.profiles; it public.shop_items; cost bigint;
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
  cost := public.scx_price(it.price, auth.uid());
  if p.balance < cost then raise exception 'Not enough coins'; end if;
  update public.profiles set spent = spent + cost where id = auth.uid();
  insert into public.purchases (user_id, item_id) values (auth.uid(), item);
  return p.balance - cost;
end $$;

create or replace function public.scx_gift(item bigint, target uuid, note text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare me public.profiles; it public.shop_items; n bigint; cost bigint; clean text := nullif(left(trim(coalesce(note, '')), 200), '');
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into it from public.shop_items where id = item and active for update;
  if not found then raise exception 'This item is not in the shop anymore'; end if;
  if it.kind not in ('gift', 'pack', 'tag', 'frame') then raise exception 'This can''t be sent as a gift'; end if;
  if not exists (select 1 from public.profiles where id = target) then raise exception 'User not found'; end if;
  if it.kind in ('tag', 'frame') then
    if target = auth.uid() then raise exception 'Buy it for yourself in the Shop'; end if;
    if exists (select 1 from public.purchases where user_id = target and item_id = item) then raise exception 'They already have this'; end if;
  elsif public.scx_gift_room(target) <= 0 then
    if target = auth.uid() then raise exception 'Your gift box is full — sell or give some gifts away first';
    else raise exception 'Their gift box is full'; end if;
  end if;
  if it.supply is not null and it.sold >= it.supply then raise exception 'Sold out'; end if;
  select * into me from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Join SCX Online first'; end if;
  cost := public.scx_price(it.price, auth.uid());
  if me.balance < cost then raise exception 'Not enough coins'; end if;
  update public.profiles set spent = spent + cost where id = auth.uid();
  update public.shop_items set sold = sold + 1 where id = item returning sold into n;
  if it.kind in ('tag', 'frame') then insert into public.purchases (user_id, item_id) values (target, item); end if;
  insert into public.gifts (item_id, kind, name, data, num, from_user, to_user, note)
    values (item, it.kind, it.name, it.data, case when it.kind = 'pack' then null else n end, auth.uid(), target, clean);
  if target <> auth.uid() then
    insert into public.messages (to_user, text, kind)
      values (target, left('🎁 ' || me.nick || ' sent you ' || it.name || coalesce(' — "' || clean || '"', ''), 500), 'gift');
  end if;
  return me.balance - cost;
end $$;

create or replace function public.scx_transfer_gift(gift bigint, target uuid, note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare g public.gifts; me public.profiles; clean text := nullif(left(trim(coalesce(note, '')), 200), '');
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if target = auth.uid() then raise exception 'It is already yours'; end if;
  select * into g from public.gifts where id = gift and to_user = auth.uid() and kind in ('gift', 'pack') for update;
  if not found then raise exception 'This is not your gift'; end if;
  if exists (select 1 from public.market where gift_id = gift) then raise exception 'It is on the market — take it off first'; end if;
  if not exists (select 1 from public.profiles where id = target) then raise exception 'User not found'; end if;
  if public.scx_gift_room(target) <= 0 then raise exception 'Their gift box is full'; end if;
  select * into me from public.profiles where id = auth.uid();
  update public.gifts set to_user = target, from_user = auth.uid(), note = clean, pinned = null, created_at = now() where id = gift;
  insert into public.messages (to_user, text, kind)
    values (target, left('🎁 ' || me.nick || ' sent you ' || g.name || coalesce(' #' || g.num, '') || coalesce(' — "' || clean || '"', ''), 500), 'gift');
end $$;

create or replace function public.scx_pin_gift(gift bigint, slot smallint default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if slot is not null and (slot < 1 or slot > 3) then raise exception 'Max 3 gifts on the profile'; end if;
  if not exists (select 1 from public.gifts where id = gift and to_user = auth.uid() and kind = 'gift') then
    raise exception 'This is not your gift';
  end if;
  if slot is null then update public.gifts set pinned = null where id = gift; return; end if;
  if exists (select 1 from public.market where gift_id = gift) then raise exception 'It is on the market — take it off first'; end if;
  update public.gifts set pinned = null where to_user = auth.uid() and (pinned = slot or id = gift);
  update public.gifts set pinned = slot where id = gift;
end $$;

-- open a pack: one every 10 seconds
create or replace function public.scx_open_pack(gift bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g public.gifts; pick public.shop_items; pick_id bigint; n bigint; last timestamptz;
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
  update public.gifts set kind = 'gift', item_id = pick.id, name = pick.name, data = pick.data, num = n, pinned = null
    where id = g.id;
  return jsonb_build_object('id', g.id, 'item', pick.id, 'name', pick.name, 'data', pick.data, 'num', n);
end $$;

-- ---------------------------------------------------------------- market functions
create or replace function public.scx_market_list(gift bigint, price bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare g public.gifts; lid bigint;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if price is null or price < 1 or price > 100000000 then raise exception 'Price: 1 – 100 000 000'; end if;
  select * into g from public.gifts where id = gift and to_user = auth.uid() and kind in ('gift', 'pack') for update;
  if not found then raise exception 'This is not your gift'; end if;
  if exists (select 1 from public.market where gift_id = gift) then raise exception 'Already on the market'; end if;
  if (select count(*) from public.market where seller = auth.uid()) >= 10 then raise exception 'Max 10 things on the market'; end if;
  update public.gifts set pinned = null where id = gift;
  insert into public.market (gift_id, seller, price, kind, name, data, num)
    values (gift, auth.uid(), price, g.kind, g.name, g.data, g.num) returning id into lid;
  return lid;
end $$;

create or replace function public.scx_market_cancel(listing bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  delete from public.market where id = listing and seller = auth.uid();
  if not found then raise exception 'This is not your listing'; end if;
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
  if public.scx_gift_room(auth.uid()) <= 0 then raise exception 'Your gift box is full — sell or give some gifts away first'; end if;
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

-- ---------------------------------------------------------------- promo codes (made by SCX ADMIN)
create table if not exists public.promo_codes (
  id bigint generated always as identity primary key,
  code text not null check (code ~ '^[A-Za-z0-9_-]{3,32}$'),
  kind text not null check (kind in ('coins', 'premium', 'item')),
  amount bigint check (amount is null or amount between 1 and 100000000),
  item_id bigint references public.shop_items(id) on delete set null,
  max_uses integer not null default 1 check (max_uses between 1 and 1000000),
  uses integer not null default 0,
  expires_at timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null on update cascade,
  created_at timestamptz not null default now()
);
create unique index if not exists promo_codes_code on public.promo_codes (lower(code));
create table if not exists public.promo_uses (
  code_id bigint not null references public.promo_codes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade on update cascade,
  used_at timestamptz not null default now(),
  primary key (code_id, user_id)
);
alter table public.promo_codes enable row level security;
alter table public.promo_uses enable row level security;
drop policy if exists "promo: admin read" on public.promo_codes;
drop policy if exists "promo: admin add" on public.promo_codes;
drop policy if exists "promo: admin edit" on public.promo_codes;
drop policy if exists "promo: admin delete" on public.promo_codes;
create policy "promo: admin read" on public.promo_codes for select using (public.scx_is_admin());
create policy "promo: admin add" on public.promo_codes for insert with check (public.scx_is_admin() and uses = 0);
create policy "promo: admin edit" on public.promo_codes for update using (public.scx_is_admin()) with check (public.scx_is_admin());
create policy "promo: admin delete" on public.promo_codes for delete using (public.scx_is_admin());
drop policy if exists "promo uses: admin read" on public.promo_uses;
create policy "promo uses: admin read" on public.promo_uses for select using (public.scx_is_admin());
revoke insert, update, delete on public.promo_uses from anon, authenticated;

create or replace function public.scx_redeem(code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pc public.promo_codes; it public.shop_items; n bigint;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid()) then raise exception 'Join SCX Online first'; end if;
  perform pg_sleep(0.3); -- makes guessing codes slow
  select * into pc from public.promo_codes where lower(promo_codes.code) = lower(trim(coalesce(scx_redeem.code, ''))) for update;
  if not found or not pc.active then raise exception 'Wrong promo code'; end if;
  if pc.expires_at is not null and pc.expires_at < now() then raise exception 'This promo code has expired'; end if;
  if pc.uses >= pc.max_uses then raise exception 'This promo code is used up'; end if;
  if exists (select 1 from public.promo_uses where code_id = pc.id and user_id = auth.uid()) then raise exception 'You already used this code'; end if;

  if pc.kind = 'coins' then
    update public.profiles set bonus = bonus + pc.amount where id = auth.uid();
  elsif pc.kind = 'premium' then
    if (select premium from public.profiles where id = auth.uid()) then raise exception 'You already have Premium'; end if;
    update public.profiles set premium = true where id = auth.uid();
  else
    select * into it from public.shop_items where id = pc.item_id for update;
    if not found then raise exception 'The prize of this code does not exist anymore'; end if;
    if it.kind in ('gift', 'pack') then
      if public.scx_gift_room(auth.uid()) <= 0 then raise exception 'Your gift box is full — sell or give some gifts away first'; end if;
      if it.supply is not null and it.sold >= it.supply then raise exception 'This prize is sold out'; end if;
      update public.shop_items set sold = sold + 1 where id = it.id returning sold into n;
      insert into public.gifts (item_id, kind, name, data, num, to_user, note)
        values (it.id, it.kind, it.name, it.data, case when it.kind = 'pack' then null else n end, auth.uid(), 'Promo code');
    else
      if exists (select 1 from public.purchases where user_id = auth.uid() and item_id = it.id) then raise exception 'You already have this'; end if;
      insert into public.purchases (user_id, item_id) values (auth.uid(), it.id);
    end if;
  end if;
  update public.promo_codes set uses = uses + 1 where id = pc.id;
  insert into public.promo_uses (code_id, user_id) values (pc.id, auth.uid());
  return jsonb_build_object('kind', pc.kind, 'amount', pc.amount, 'item', it.name, 'item_kind', it.kind);
end $$;

revoke execute on function public.scx_buy_premium() from public, anon;
revoke execute on function public.scx_market_list(bigint, bigint) from public, anon;
revoke execute on function public.scx_market_cancel(bigint) from public, anon;
revoke execute on function public.scx_market_buy(bigint) from public, anon;
revoke execute on function public.scx_redeem(text) from public, anon;
revoke execute on function public.scx_price(bigint, uuid) from public, anon;
revoke execute on function public.scx_gift_room(uuid) from public, anon;
grant execute on function public.scx_buy_premium() to authenticated;
grant execute on function public.scx_market_list(bigint, bigint) to authenticated;
grant execute on function public.scx_market_cancel(bigint) to authenticated;
grant execute on function public.scx_market_buy(bigint) to authenticated;
grant execute on function public.scx_redeem(text) to authenticated;
grant execute on function public.scx_gift_room(uuid) to authenticated;
