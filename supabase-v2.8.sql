-- SoundCloudX v2.8 update: the market remembers the ORIGINAL Shop price of every listing
-- (so limited gifts that are sold out in the Shop still show what they cost)
-- Supabase → SQL Editor → New query → paste everything → Run   (needs v1.7 … v2.7 first). Safe to run again.

alter table public.market add column if not exists orig_price bigint;

-- listings that already exist
update public.market m set orig_price = s.price
from public.gifts g join public.shop_items s on s.id = g.item_id
where g.id = m.gift_id and m.orig_price is null;

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
  insert into public.market (gift_id, seller, price, kind, name, data, num, variant, orig_price)
    values (gift, auth.uid(), price, g.kind, g.name, g.data, g.num, g.variant, (select s.price from public.shop_items s where s.id = g.item_id))
    returning id into lid;
  return lid;
end $$;
