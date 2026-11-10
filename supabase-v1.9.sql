-- SoundCloudX v1.9 update: profile frames + profile backgrounds
-- Supabase → SQL Editor → New query → paste everything → Run
-- (needs supabase-v1.7.sql and supabase-v1.8.sql first)

alter table public.profiles add column if not exists frame jsonb check (frame is null or pg_column_size(frame) < 1000);
alter table public.profiles add column if not exists profile_bg text check (profile_bg is null or (length(profile_bg) < 600 and profile_bg like 'https://%'));

-- the shop can now sell frames too
alter table public.shop_items drop constraint if exists shop_items_kind_check;
alter table public.shop_items add constraint shop_items_kind_check check (kind in ('tag', 'image', 'gif', 'theme', 'frame'));

-- frame + profile background can only come from things you bought (same protection as tags)
create or replace function public.scx_guard_profile() returns trigger
language plpgsql set search_path = public as $$
declare
  trusted boolean := current_user in ('postgres', 'supabase_admin', 'service_role');
begin
  if tg_op = 'INSERT' then
    new.coins := least(greatest(new.coins, 0), 100000);
    if not trusted then
      new.bonus := 0; new.spent := 0; new.tag_text := null; new.tag_color := null; new.is_admin := false;
      new.frame := null; new.profile_bg := null;
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
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- wear a frame you bought (null = no frame)
create or replace function public.scx_equip_frame(item bigint) returns void
language plpgsql security definer set search_path = public as $$
declare it public.shop_items;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if item is null then update public.profiles set frame = null where id = auth.uid(); return; end if;
  select s.* into it from public.shop_items s
    join public.purchases b on b.item_id = s.id and b.user_id = auth.uid()
    where s.id = item and s.kind = 'frame';
  if not found then raise exception 'Buy this frame first'; end if;
  update public.profiles set frame = jsonb_build_object(
      'style', coalesce(nullif(it.data->>'style', ''), 'gradient'),
      'colors', coalesce(it.data->'colors', '["#ff5500","#ffb347"]'::jsonb),
      'name', it.name)
    where id = auth.uid();
end $$;

-- put a picture / GIF you bought behind your profile (null = none)
create or replace function public.scx_equip_profile_bg(item bigint) returns void
language plpgsql security definer set search_path = public as $$
declare it public.shop_items;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if item is null then update public.profiles set profile_bg = null where id = auth.uid(); return; end if;
  select s.* into it from public.shop_items s
    join public.purchases b on b.item_id = s.id and b.user_id = auth.uid()
    where s.id = item and s.kind in ('image', 'gif');
  if not found then raise exception 'Buy this picture first'; end if;
  if coalesce(it.data->>'url', '') not like 'https://%' then raise exception 'This picture has no link'; end if;
  update public.profiles set profile_bg = it.data->>'url' where id = auth.uid();
end $$;

revoke execute on function public.scx_equip_frame(bigint) from public, anon;
revoke execute on function public.scx_equip_profile_bg(bigint) from public, anon;
grant execute on function public.scx_equip_frame(bigint) to authenticated;
grant execute on function public.scx_equip_profile_bg(bigint) to authenticated;

-- starter frames (only if there are no frames yet)
insert into public.shop_items (kind, name, price, data)
select * from (values
  ('frame', '🧡 Classic',   2000::bigint, '{"style":"gradient","colors":["#ff5500","#ffb347"]}'::jsonb),
  ('frame', '🖤 Mono',      4000,  '{"style":"gradient","colors":["#ffffff","#3a3a3a","#ffffff"]}'),
  ('frame', '❄️ Frost',     7000,  '{"style":"glow","colors":["#7dd3fc","#e0f2fe"]}'),
  ('frame', '💜 Neon',      9000,  '{"style":"glow","colors":["#d946ef","#7c3aed"]}'),
  ('frame', '🔥 Inferno',   15000, '{"style":"spin","colors":["#ff1e00","#ff9500","#ffd000","#ff1e00"]}'),
  ('frame', '🌈 Rainbow',   25000, '{"style":"spin","colors":["#ff3b3b","#ffd93b","#3bff7a","#3bc8ff","#a03bff","#ff3b3b"]}'),
  ('frame', '👑 Royal Gold', 60000, '{"style":"spin","colors":["#fff1a8","#ffd700","#b8860b","#ffd700","#fff1a8"]}')
) as v(kind, name, price, data)
where not exists (select 1 from public.shop_items where kind = 'frame');
