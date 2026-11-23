-- SoundCloudX v2.7 update: send gifts / coins anonymously (or with your name)
-- Supabase → SQL Editor → New query → paste everything → Run   (needs v1.7 … v2.6 first). Safe to run again.

drop function if exists public.scx_gift(bigint, uuid, text);
drop function if exists public.scx_send_coins(uuid, bigint, text);
drop function if exists public.scx_transfer_gift(bigint, uuid, text);

-- send (or buy for yourself) a gift, pack, tag or frame. anon = the other person does not see who sent it
create or replace function public.scx_gift(item bigint, target uuid, note text default null, anon boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.profiles; it public.shop_items; n bigint; cost bigint; gid bigint; clean text := nullif(left(trim(coalesce(note, '')), 200), '');
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
    values (item, it.kind, it.name, it.data, case when it.kind = 'pack' then null else n end,
            case when anon and target <> auth.uid() then null else auth.uid() end, target, clean)
    returning id into gid;
  if target <> auth.uid() then
    insert into public.messages (to_user, text, kind)
      values (target, left('🎁 ' || case when anon then 'Someone' else me.nick end || ' sent you ' || it.name || coalesce(' — "' || clean || '"', ''), 500), 'gift');
  end if;
  return jsonb_build_object('balance', me.balance - cost, 'id', gid, 'num', case when it.kind = 'pack' then null else n end);
end $$;

create or replace function public.scx_send_coins(target uuid, amount bigint, note text default null, anon boolean default false) returns jsonb
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
    values ('coins', amount || ' coins', amount, case when anon then null else auth.uid() end, target, clean);
  insert into public.messages (to_user, text, kind)
    values (target, left('🪙 ' || case when anon then 'Someone' else me.nick end || ' sent you ' || amount || ' coins' || coalesce(' — "' || clean || '"', ''), 500), 'gift');
  return jsonb_build_object('balance', me.balance - amount);
end $$;

create or replace function public.scx_transfer_gift(gift bigint, target uuid, note text default null, anon boolean default false) returns jsonb
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
  update public.gifts set to_user = target, from_user = case when anon then null else auth.uid() end, note = clean, pinned = null, created_at = now() where id = gift;
  insert into public.messages (to_user, text, kind)
    values (target, left('🎁 ' || case when anon then 'Someone' else me.nick end || ' sent you ' || g.name || coalesce(' #' || g.num, '') || coalesce(' — "' || clean || '"', ''), 500), 'gift');
  return jsonb_build_object('id', g.id, 'num', g.num);
end $$;

revoke execute on function public.scx_gift(bigint, uuid, text, boolean) from public, anon;
revoke execute on function public.scx_send_coins(uuid, bigint, text, boolean) from public, anon;
revoke execute on function public.scx_transfer_gift(bigint, uuid, text, boolean) from public, anon;
grant execute on function public.scx_gift(bigint, uuid, text, boolean) to authenticated;
grant execute on function public.scx_send_coins(uuid, bigint, text, boolean) to authenticated;
grant execute on function public.scx_transfer_gift(bigint, uuid, text, boolean) to authenticated;
