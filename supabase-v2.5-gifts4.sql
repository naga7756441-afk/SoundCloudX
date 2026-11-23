-- SoundCloudX: 4 Mythic gifts (🔱 Trident is limited: only 60)
-- Supabase → SQL Editor → New query → paste everything → Run. Safe to run again.

insert into public.shop_items (kind, name, price, supply, data)
select v.kind, v.name, v.price, v.supply, v.data
from (values
  ('gift', '👽 Alien',         110000::bigint, null::bigint, '{"emoji":"👽","rarity":"mythic"}'::jsonb),
  ('gift', '🦑 Kraken',        130000,  null, '{"emoji":"🦑","rarity":"mythic"}'),
  ('gift', '🌠 Shooting Star', 160000,  null, '{"emoji":"🌠","rarity":"mythic"}'),
  ('gift', '🔱 Trident',       200000,  60,   '{"emoji":"🔱","rarity":"mythic"}')
) as v(kind, name, price, supply, data)
where not exists (select 1 from public.shop_items s where s.kind = 'gift' and s.name = v.name);
