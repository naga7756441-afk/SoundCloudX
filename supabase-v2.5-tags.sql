-- SoundCloudX: 5 new tags
-- Supabase → SQL Editor → New query → paste everything → Run. Safe to run again.

insert into public.shop_items (kind, name, price, data)
select v.kind, v.name, v.price, v.data
from (values
  ('tag', '🌊 Chill',     4000::bigint, '{"text":"🌊 CHILL","color":"#38bdf8"}'::jsonb),
  ('tag', '🎤 Rapper',    6000,  '{"text":"🎤 RAPPER","color":"#f43f5e"}'),
  ('tag', '🎹 Producer',  9000,  '{"text":"🎹 PRODUCER","color":"#22c55e"}'),
  ('tag', '💜 Vibe',      12000, '{"text":"💜 VIBE","color":"#c084fc"}'),
  ('tag', '💎 Legend',    35000, '{"text":"💎 LEGEND","color":"#67e8f9"}')
) as v(kind, name, price, data)
where not exists (select 1 from public.shop_items s where s.kind = 'tag' and s.name = v.name);
