-- SoundCloudX: 10 new gifts
-- Supabase → SQL Editor → New query → paste everything → Run. Safe to run again (adds only missing ones).

insert into public.shop_items (kind, name, price, supply, data)
select v.kind, v.name, v.price, v.supply, v.data
from (values
  ('gift', '🎵 Note',           600::bigint,  null::bigint, '{"emoji":"🎵","rarity":"common"}'::jsonb),
  ('gift', '☕ Coffee',          900,     null, '{"emoji":"☕","rarity":"common"}'),
  ('gift', '🎤 Microphone',     2200,    null, '{"emoji":"🎤","rarity":"uncommon"}'),
  ('gift', '📻 Radio',          3000,    null, '{"emoji":"📻","rarity":"uncommon"}'),
  ('gift', '💿 Gold Record',    8000,    null, '{"emoji":"💿","rarity":"rare"}'),
  ('gift', '🎹 Piano',          9500,    null, '{"emoji":"🎹","rarity":"rare"}'),
  ('gift', '🚀 Rocket',         20000,   800,  '{"emoji":"🚀","rarity":"epic"}'),
  ('gift', '🔥 Phoenix Flame',  60000,   300,  '{"emoji":"🔥","rarity":"legendary"}'),
  ('gift', '👁️ Third Eye',      150000,  60,   '{"emoji":"👁️","rarity":"mythic"}'),
  ('gift', '🪐 Saturn',         400000,  10,   '{"emoji":"🪐","rarity":"divine"}')
) as v(kind, name, price, supply, data)
where not exists (select 1 from public.shop_items s where s.kind = 'gift' and s.name = v.name);
