-- SoundCloudX v2.9 update: craft never gives limited gifts, packs give a variant only with a ticket (x3 chance),
-- settings that SCX ADMIN can change from the app (Discord server link)
-- Supabase → SQL Editor → New query → paste everything → Run   (needs v1.7 … v2.8 first). Safe to run again.

create or replace function public.scx_open_pack(gift bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g public.gifts; pick public.shop_items; pick_id bigint; n bigint; last timestamptz; vr bigint; bo public.scx_boosts; base numeric;
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
  -- packs give NO variant … unless a ticket is active: then only its variant, chance = (variant chance + ticket bonus) × 3
  select * into bo from public.scx_boosts where user_id = auth.uid();
  if found then
    select case when (data->>'chance') ~ '^[0-9]{1,3}(\.[0-9]+)?$' then (data->>'chance')::numeric else 0 end into base
      from public.shop_items where id = bo.variant and kind = 'variant' and active;
    if base is not null and random() * 100 < least(100, (base + bo.bonus) * 3) then vr := bo.variant; end if;
    delete from public.scx_boosts where user_id = auth.uid();
  end if;
  update public.gifts set kind = 'gift', item_id = pick.id, name = pick.name, data = pick.data, num = n, pinned = null, variant = vr
    where id = g.id;
  return jsonb_build_object('id', g.id, 'item', pick.id, 'name', pick.name, 'data', pick.data, 'num', n, 'variant', vr);
end $$;

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
    where kind = 'gift' and active and coalesce(data->>'rarity', 'common') = nxt and supply is null -- craft never gives limited gifts
    order by random() limit 1 for update;
  if not found then raise exception 'No % gifts to craft (limited gifts can''t be crafted)', nxt; end if;
  delete from public.gifts where id = any(ids);
  update public.shop_items set sold = sold + 1 where id = pick.id returning sold into n;
  vr := public.scx_roll_variant(auth.uid());
  insert into public.gifts (item_id, kind, name, data, num, to_user, note, variant)
    values (pick.id, 'gift', pick.name, pick.data, n, auth.uid(), 'Crafted', vr) returning id into gid;
  return jsonb_build_object('id', gid, 'item', pick.id, 'name', pick.name, 'data', pick.data, 'num', n, 'variant', vr);
end $$;

-- ---------------------------------------------------------------- settings for everybody (only SCX ADMIN can change them)
create table if not exists public.scx_config (
  key text primary key check (key ~ '^[a-z_]{2,32}$'),
  value text check (value is null or length(value) <= 500),
  updated_at timestamptz not null default now()
);
alter table public.scx_config enable row level security;
drop policy if exists "config: read" on public.scx_config;
drop policy if exists "config: admin add" on public.scx_config;
drop policy if exists "config: admin edit" on public.scx_config;
drop policy if exists "config: admin delete" on public.scx_config;
create policy "config: read" on public.scx_config for select using (true);
create policy "config: admin add" on public.scx_config for insert with check (public.scx_is_admin());
create policy "config: admin edit" on public.scx_config for update using (public.scx_is_admin()) with check (public.scx_is_admin());
create policy "config: admin delete" on public.scx_config for delete using (public.scx_is_admin());
grant select on public.scx_config to anon, authenticated;
grant insert, update, delete on public.scx_config to authenticated;
insert into public.scx_config (key, value) values ('discord', null) on conflict (key) do nothing;
