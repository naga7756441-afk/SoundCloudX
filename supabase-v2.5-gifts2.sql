-- SoundCloudX: 15 more gifts (Common / Uncommon / Rare)
-- The emojis are written as codes (U&'\+01F98B' = 🦋), so copy / paste can't break them.
-- Supabase → SQL Editor → New query → paste everything → Run. Safe to run again.

insert into public.shop_items (kind, name, price, supply, data)
select v.kind, v.name, v.price, v.supply, v.data
from (values
  ('gift', U&'\+01F36D Lollipop', 400::bigint, null::bigint, jsonb_build_object('emoji', U&'\+01F36D', 'rarity', 'common')::jsonb),
  ('gift', U&'\+01F33B Sunflower', 500, null, jsonb_build_object('emoji', U&'\+01F33B', 'rarity', 'common')),
  ('gift', U&'\+01F355 Pizza', 700, null, jsonb_build_object('emoji', U&'\+01F355', 'rarity', 'common')),
  ('gift', U&'\+01F9F8 Teddy Bear', 1000, null, jsonb_build_object('emoji', U&'\+01F9F8', 'rarity', 'common')),
  ('gift', U&'\+01F388 Balloon', 1200, null, jsonb_build_object('emoji', U&'\+01F388', 'rarity', 'common')),
  ('gift', U&'\+01F941 Drum', 1800, null, jsonb_build_object('emoji', U&'\+01F941', 'rarity', 'uncommon')),
  ('gift', U&'\+01F3B7 Saxophone', 2400, null, jsonb_build_object('emoji', U&'\+01F3B7', 'rarity', 'uncommon')),
  ('gift', U&'\+01F6F9 Skateboard', 2800, null, jsonb_build_object('emoji', U&'\+01F6F9', 'rarity', 'uncommon')),
  ('gift', U&'\+01F576\+00FE0F Sunglasses', 3200, null, jsonb_build_object('emoji', U&'\+01F576\+00FE0F', 'rarity', 'uncommon')),
  ('gift', U&'\+01F319 Moon', 3600, null, jsonb_build_object('emoji', U&'\+01F319', 'rarity', 'uncommon')),
  ('gift', U&'\+01F3BB Violin', 6500, null, jsonb_build_object('emoji', U&'\+01F3BB', 'rarity', 'rare')),
  ('gift', U&'\+0026A1 Lightning', 7500, null, jsonb_build_object('emoji', U&'\+0026A1', 'rarity', 'rare')),
  ('gift', U&'\+01F98B Butterfly', 8500, null, jsonb_build_object('emoji', U&'\+01F98B', 'rarity', 'rare')),
  ('gift', U&'\+01F308 Rainbow', 10000, null, jsonb_build_object('emoji', U&'\+01F308', 'rarity', 'rare')),
  ('gift', U&'\+01F3A7 Gold Headset', 12000, null, jsonb_build_object('emoji', U&'\+01F3A7', 'rarity', 'rare'))
) as v(kind, name, price, supply, data)
where not exists (select 1 from public.shop_items s where s.kind = 'gift' and s.name = v.name);
