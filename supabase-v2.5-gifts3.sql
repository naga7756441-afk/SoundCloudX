-- SoundCloudX: 8 more gifts (1 Rare, 5 Epic, 2 Legendary) — no limit
-- Supabase → SQL Editor → New query → paste everything → Run. Safe to run again.
-- The last line inside values (...) must NOT end with a comma.

insert into public.shop_items (kind, name, price, supply, data)
select v.kind, v.name, v.price, v.supply, v.data
from (values
  ('gift', '🎺 Trumpet',       11000::bigint, null::bigint, '{"emoji":"🎺","rarity":"rare"}'::jsonb),
  ('gift', '🐺 Wolf',          16000,   null, '{"emoji":"🐺","rarity":"epic"}'),
  ('gift', '🦅 Eagle',         18000,   null, '{"emoji":"🦅","rarity":"epic"}'),
  ('gift', '🎆 Fireworks',     20000,   null, '{"emoji":"🎆","rarity":"epic"}'),
  ('gift', '🧿 Amulet',        22000,   null, '{"emoji":"🧿","rarity":"epic"}'),
  ('gift', '🌋 Volcano',       25000,   null, '{"emoji":"🌋","rarity":"epic"}'),
  ('gift', '💍 Diamond Ring',  45000,   null, '{"emoji":"💍","rarity":"legendary"}'),
  ('gift', '🦁 Lion',          55000,   null, '{"emoji":"🦁","rarity":"legendary"}')
) as v(kind, name, price, supply, data)
where not exists (select 1 from public.shop_items s where s.kind = 'gift' and s.name = v.name);
