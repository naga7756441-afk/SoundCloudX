-- SoundCloudX v1.8 update: Shop, tags, admin panel, messages
-- Supabase → SQL Editor → New query → paste everything → Run
-- (run supabase-v1.7.sql first if you have not)

-- ---------------------------------------------------------------- profiles: balance, tag, admin
alter table public.profiles add column if not exists bonus bigint not null default 0;
alter table public.profiles add column if not exists spent bigint not null default 0;
alter table public.profiles add column if not exists tag_text text check (tag_text is null or length(tag_text) <= 24);
alter table public.profiles add column if not exists tag_color text check (tag_color is null or tag_color ~ '^#[0-9a-fA-F]{6}$');
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists balance bigint generated always as (coins + bonus - spent) stored;
-- one SoundCloud link = one SCX profile
create unique index if not exists profiles_sc_url_unique on public.profiles (lower(sc_url)) where sc_url is not null;

-- users may only change nick / picture / link / coins / stats. bonus, spent, tag and admin
-- can only be changed by the functions below (or by you in the SQL Editor)
create or replace function public.scx_guard_profile() returns trigger
language plpgsql set search_path = public as $$
declare
  trusted boolean := current_user in ('postgres', 'supabase_admin', 'service_role');
begin
  if tg_op = 'INSERT' then
    new.coins := least(greatest(new.coins, 0), 100000);
    if not trusted then
      new.bonus := 0; new.spent := 0; new.tag_text := null; new.tag_color := null; new.is_admin := false;
    end if;
  else
    if new.coins < old.coins then new.coins := old.coins; end if;
    if new.coins - old.coins > 100000 then new.coins := old.coins + 100000; end if;
    if new.coins <> old.coins and old.updated_at > now() - interval '10 seconds' then new.coins := old.coins; end if;
    if not trusted then
      new.bonus := old.bonus; new.spent := old.spent;
      new.tag_text := old.tag_text; new.tag_color := old.tag_color;
      new.is_admin := old.is_admin;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists scx_guard_profile on public.profiles;
create trigger scx_guard_profile before insert or update on public.profiles
  for each row execute function public.scx_guard_profile();

create or replace function public.scx_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- ---------------------------------------------------------------- shop
create table if not exists public.shop_items (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('tag', 'image', 'gif', 'theme')),
  name text not null check (length(name) between 1 and 40),
  price bigint not null check (price between 0 and 100000000),
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) < 4000),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.purchases (
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id bigint not null references public.shop_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  to_user uuid references public.profiles(id) on delete cascade, -- empty = message for everybody
  text text not null check (length(text) between 1 and 500),
  from_admin uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.shop_items enable row level security;
alter table public.purchases enable row level security;
alter table public.messages enable row level security;

drop policy if exists "shop: read" on public.shop_items;
drop policy if exists "shop: admin add" on public.shop_items;
drop policy if exists "shop: admin edit" on public.shop_items;
drop policy if exists "shop: admin delete" on public.shop_items;
create policy "shop: read" on public.shop_items for select using (active or public.scx_is_admin());
create policy "shop: admin add" on public.shop_items for insert with check (public.scx_is_admin());
create policy "shop: admin edit" on public.shop_items for update using (public.scx_is_admin()) with check (public.scx_is_admin());
create policy "shop: admin delete" on public.shop_items for delete using (public.scx_is_admin());

drop policy if exists "purchases: own" on public.purchases;
create policy "purchases: own" on public.purchases for select using (user_id = auth.uid());

drop policy if exists "messages: read" on public.messages;
drop policy if exists "messages: admin send" on public.messages;
drop policy if exists "messages: admin delete" on public.messages;
create policy "messages: read" on public.messages for select using (to_user is null or to_user = auth.uid() or public.scx_is_admin());
create policy "messages: admin send" on public.messages for insert with check (public.scx_is_admin() and from_admin = auth.uid());
create policy "messages: admin delete" on public.messages for delete using (public.scx_is_admin());

-- buy: checks the balance on the server and takes the coins
create or replace function public.scx_buy(item bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare p public.profiles; it public.shop_items;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into it from public.shop_items where id = item and active;
  if not found then raise exception 'This item is not in the shop anymore'; end if;
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

-- wear a tag you bought (null = no tag)
create or replace function public.scx_equip_tag(item bigint) returns void
language plpgsql security definer set search_path = public as $$
declare it public.shop_items;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if item is null then
    update public.profiles set tag_text = null, tag_color = null where id = auth.uid();
    return;
  end if;
  select s.* into it from public.shop_items s
    join public.purchases b on b.item_id = s.id and b.user_id = auth.uid()
    where s.id = item and s.kind = 'tag';
  if not found then raise exception 'Buy this tag first'; end if;
  update public.profiles
    set tag_text = left(coalesce(it.data->>'text', it.name), 24),
        tag_color = case when (it.data->>'color') ~ '^#[0-9a-fA-F]{6}$' then it.data->>'color' else '#ff5500' end
    where id = auth.uid();
end $$;

-- admin: give coins (+ a personal message)
create or replace function public.scx_give(target uuid, amount bigint, note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.scx_is_admin() then raise exception 'SCX ADMIN only'; end if;
  if amount is null or amount <= 0 or amount > 100000000 then raise exception 'Amount: 1 – 100 000 000'; end if;
  update public.profiles set bonus = bonus + amount where id = target;
  if not found then raise exception 'User not found'; end if;
  insert into public.messages (to_user, text, from_admin)
    values (target, left(coalesce(nullif(trim(note), ''), '🪙 You received ' || amount || ' coins from SCX ADMIN'), 500), auth.uid());
end $$;

revoke execute on function public.scx_buy(bigint) from public, anon;
revoke execute on function public.scx_equip_tag(bigint) from public, anon;
revoke execute on function public.scx_give(uuid, bigint, text) from public, anon;
grant execute on function public.scx_buy(bigint) to authenticated;
grant execute on function public.scx_equip_tag(bigint) to authenticated;
grant execute on function public.scx_give(uuid, bigint, text) to authenticated;
grant execute on function public.scx_is_admin() to authenticated;

-- ---------------------------------------------------------------- files for the shop (pictures / GIFs)
insert into storage.buckets (id, name, public) values ('shop', 'shop', true) on conflict (id) do nothing;
drop policy if exists "scx shop files: admin upload" on storage.objects;
drop policy if exists "scx shop files: admin delete" on storage.objects;
create policy "scx shop files: admin upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'shop' and public.scx_is_admin());
create policy "scx shop files: admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'shop' and public.scx_is_admin());

-- ---------------------------------------------------------------- starter items (only if the shop is empty)
insert into public.shop_items (kind, name, price, data)
select * from (values
  ('tag',   '🔥 Fire',       3000::bigint,  '{"text":"🔥 FIRE","color":"#ff4d00"}'::jsonb),
  ('tag',   '🎧 Audiophile', 5000,  '{"text":"🎧 AUDIOPHILE","color":"#22d3ee"}'),
  ('tag',   '💀 Phonk',      8000,  '{"text":"💀 PHONK","color":"#a855f7"}'),
  ('tag',   '⚡ Bass Head',  12000, '{"text":"⚡ BASS HEAD","color":"#facc15"}'),
  ('tag',   '🌙 Night Owl',  15000, '{"text":"🌙 NIGHT OWL","color":"#6366f1"}'),
  ('tag',   '👑 King',       50000, '{"text":"👑 KING","color":"#ffd700"}'),
  ('theme', 'Black & White', 6000,  '{"accent":"#e5e5e5","slider":"#ffffff","menu":"#050505","panel":"#0a0a0a","cycle":["#ffffff","#8a8a8a","#2a2a2a"],"scene":"liquid"}'),
  ('theme', 'Neon Pink',     8000,  '{"accent":"#ff2a6d","slider":"#ff2a6d","menu":"#12041a","panel":"#14061c","cycle":["#ff2a6d","#d300c5","#7a04eb"],"scene":"cyberpunk"}'),
  ('theme', 'Ocean',         8000,  '{"accent":"#00b4ff","slider":"#00f2c3","menu":"#020c18","panel":"#04111f","cycle":["#00c6ff","#0072ff","#00f2c3"],"scene":"rainy"}'),
  ('theme', 'Toxic',         10000, '{"accent":"#39ff14","slider":"#c6ff00","menu":"#030a02","panel":"#061005","cycle":["#39ff14","#00ff9d","#c6ff00"],"scene":"underground"}'),
  ('theme', 'Blood Moon',    12000, '{"accent":"#ff1e1e","slider":"#ff6b6b","menu":"#0d0202","panel":"#120404","cycle":["#ff1e1e","#8b0000","#ff6b6b"],"scene":"space"}'),
  ('theme', 'Gold Rush',     20000, '{"accent":"#ffc400","slider":"#ffd700","menu":"#0d0a02","panel":"#120e04","cycle":["#ffd700","#ff9f1a","#fff1a8"],"scene":"darkwave"}')
) as v(kind, name, price, data)
where not exists (select 1 from public.shop_items);

-- ---------------------------------------------------------------- make yourself SCX ADMIN
-- Run AFTER you joined SCX Online with your SoundCloud link (https://soundcloud.com/naga-429078348).
-- Admin is given here on purpose and not by the link alone — otherwise anybody could paste your link and be admin.
update public.profiles set is_admin = true where lower(sc_url) = 'https://soundcloud.com/naga-429078348';
